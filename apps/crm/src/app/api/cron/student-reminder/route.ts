import { createServiceClient } from "@/lib/supabase/server";
import { sendSlackMessage, logNotification } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** edu-report チャンネル */
const EDU_REPORT_CHANNEL = "C094DA9A9B4";

const RESEND_API_KEY = process.env.RESEND_API_KEY;

/** app_settings からキーの値を取得 */
async function getSetting(key: string): Promise<string> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();
  if (!data) return "";
  const v = data.value;
  return typeof v === "string" ? v.replace(/"/g, "") : String(v ?? "");
}

/** Resend API でメール送信 */
async function sendEmail(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set, skipping email");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Strategists運営事務局 <support@akagiconsulting.com>",
      to: [to],
      subject,
      text: body,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`Resend API error (${res.status}):`, errText);
  }
}

/** JST の今日の日付を YYYY-MM-DD で返す */
function getJSTToday(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** JST の今日から N 日後の日付を YYYY-MM-DD で返す */
function getJSTDateOffset(days: number): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** 期限当日メール本文 */
function buildTodayEmailBody(name: string): string {
  return `${name}様
いつもお世話になっております。
Strategists運営事務局でございます。

この度は、当塾のケース指導サービスをご利用いただき、誠にありがとうございます。

${name}様にご利用いただいておりますサービスの指導期限が、本日をもちまして満了となりますことをお知らせいたします。
これまでのご受講、誠にありがとうございました。${name}様の今後のご活躍を、講師・スタッフ一同、心よりお祈り申し上げます。

なお、もし指導の延長をご希望の場合は、延長プランもご用意しておりますので、お気軽にお申し付けください。

引き続き何卒よろしくお願いいたします。

Strategists運営事務局`;
}

/** 1ヶ月前メール本文 */
function buildOneMonthEmailBody(name: string, coachingEndDate: string): string {
  return `${name}様
いつもお世話になっております。
Strategists運営事務局でございます。

この度は、当塾のケース指導サービスをご利用いただき、誠にありがとうございます。

${name}様にご利用いただいておりますサービスの指導期限が、${coachingEndDate}をもちまして満了となりますことをお知らせいたします。

なお、もし指導の延長をご希望の場合は、延長プランもご用意しております。ご興味がございましたら、お気軽にお申し付けくださいませ。

引き続き何卒よろしくお願いいたします。

Strategists運営事務局`;
}

/**
 * GET /api/cron/student-reminder
 * 毎日実行: コーチング期限が当日 or 30日後の受講生にリマインドメール送信
 * ※ DEFAULT OFF — app_settings で sys_automation_student-reminder = "true" に設定しない限り実行されない
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // DEFAULT OFF: 明示的に "true" に設定しない限りスキップ
  const value = await getSetting("sys_automation_student-reminder");
  if (value !== "true") {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled (default OFF - enable explicitly)" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const today = getJSTToday();
  const thirtyDaysLater = getJSTDateOffset(30);

  // アクティブな受講生を取得
  const { data: targets, error } = await supabase
    .from("customers")
    .select(`
      id, name, email,
      learning_records!inner(coaching_end_date, total_sessions, completed_sessions),
      sales_pipeline!inner(stage)
    `)
    .not("learning_records.coaching_end_date", "is", null)
    .in("sales_pipeline.stage", ["成約", "入金済", "追加指導"]);

  if (error) {
    console.error("Student reminder query error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({
      ok: true,
      date: today,
      message: "対象受講生なし",
      todayEmails: 0,
      oneMonthEmails: 0,
      timestamp: new Date().toISOString(),
    });
  }

  let todayEmailCount = 0;
  let oneMonthEmailCount = 0;
  const errors: string[] = [];

  for (const customer of targets) {
    const name: string = customer.name || "受講生";
    const email: string | null = customer.email;

    if (!email) {
      console.warn(`Skipping customer ${customer.id} (${name}): no email`);
      continue;
    }

    // learning_records は inner join なので配列で返る
    const learningRecords = Array.isArray(customer.learning_records)
      ? customer.learning_records
      : [customer.learning_records];

    for (const lr of learningRecords) {
      const coachingEndDate: string | null = lr.coaching_end_date;
      if (!coachingEndDate) continue;

      try {
        if (coachingEndDate === today) {
          // 期限当日
          await sendEmail(
            email,
            "【重要】本日が受講期限です",
            buildTodayEmailBody(name),
          );
          todayEmailCount++;
          await logNotification({
            type: "student_reminder_today",
            customer_id: customer.id,
            recipient: email,
            message: `期限当日リマインド送信: ${name} (${email})`,
            status: "success",
            metadata: { coaching_end_date: coachingEndDate },
          });
        } else if (coachingEndDate === thirtyDaysLater) {
          // 1ヶ月前
          await sendEmail(
            email,
            "【重要】受講期限1ヶ月前のお知らせ",
            buildOneMonthEmailBody(name, coachingEndDate),
          );
          oneMonthEmailCount++;
          await logNotification({
            type: "student_reminder_one_month",
            customer_id: customer.id,
            recipient: email,
            message: `1ヶ月前リマインド送信: ${name} (${email})`,
            status: "success",
            metadata: { coaching_end_date: coachingEndDate },
          });
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`Email send error for ${name} (${email}):`, errMsg);
        errors.push(`${name}: ${errMsg}`);
        await logNotification({
          type: "student_reminder_error",
          customer_id: customer.id,
          recipient: email,
          message: `リマインド送信失敗: ${name} (${email})`,
          status: "failed",
          error_message: errMsg,
          metadata: { coaching_end_date: coachingEndDate },
        });
      }
    }
  }

  // Slack サマリー通知
  const totalEmails = todayEmailCount + oneMonthEmailCount;
  if (totalEmails > 0) {
    const slackLines = [
      `📩 *受講期限リマインド送信レポート（${today}）*`,
      ``,
      `期限当日: ${todayEmailCount}件`,
      `1ヶ月前: ${oneMonthEmailCount}件`,
      `合計: ${totalEmails}件`,
    ];
    if (errors.length > 0) {
      slackLines.push(``, `⚠️ エラー: ${errors.length}件`);
      for (const err of errors) {
        slackLines.push(`  • ${err}`);
      }
    }
    await sendSlackMessage(EDU_REPORT_CHANNEL, slackLines.join("\n"));
  }

  return NextResponse.json({
    ok: true,
    date: today,
    todayEmails: todayEmailCount,
    oneMonthEmails: oneMonthEmailCount,
    errors: errors.length,
    timestamp: new Date().toISOString(),
  });
}
