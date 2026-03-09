import { createServiceClient } from "@/lib/supabase/server";
import { sendSlackMessage, logNotification } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CUSTOMER_SUCCESS_CHANNEL = "C094DA9A9B4";

async function sendEmail(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set");
    return;
  }
  await fetch("https://api.resend.com/emails", {
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
}

/**
 * GET /api/cron/coaching-start-notification
 * Zapier #99 移管: 初回コーチング完了後の受講期間案内メール
 * - 初回セッション(session_number=1)が直近24時間内の受講者を検出
 * - coaching_end_date がある場合 → メールで受講期間案内を送信
 * - coaching_end_date がない場合 → Slackアラートで通知
 * - デフォルトOFF（app_settingsで明示的に有効化が必要）
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check app_settings - default OFF for email-sending automations
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: settingRow } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "sys_automation_coaching-start-notification")
    .single();
  const enabled =
    settingRow?.value != null
      ? typeof settingRow.value === "string"
        ? settingRow.value.replace(/"/g, "")
        : String(settingRow.value)
      : "";
  if (enabled !== "true") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "disabled (default OFF)",
    });
  }

  // JST date calculations
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  const jstToday = jstNow.toISOString().slice(0, 10);

  // 24時間前（JSTベース）
  const yesterday = new Date(jstNow);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const results = {
    emails_sent: 0,
    slack_alerts: 0,
    skipped_duplicate: 0,
    skipped_no_email: 0,
  };

  // ============================================================
  // 1. 初回コーチングセッション(session_number=1)を検索
  //    直近24時間以内のcoaching_dateを持つレコード
  // ============================================================
  const { data: firstSessions, error: queryError } = await db
    .from("coaching_reports")
    .select(
      "id, customer_id, coaching_date, session_number"
    )
    .eq("session_number", 1)
    .gte("coaching_date", yesterdayStr)
    .not("customer_id", "is", null);

  if (queryError) {
    console.error("coaching_reports query error:", queryError);
    return NextResponse.json(
      { ok: false, error: queryError.message },
      { status: 500 }
    );
  }

  if (!firstSessions || firstSessions.length === 0) {
    return NextResponse.json({
      ok: true,
      date: jstToday,
      results,
      message: "対象なし",
      timestamp: now.toISOString(),
    });
  }

  // ============================================================
  // 2. 各対象者を処理
  // ============================================================
  for (const session of firstSessions) {
    const customerId = session.customer_id;
    const coachingDate = session.coaching_date;

    // 顧客情報取得
    const { data: customer } = await db
      .from("customers")
      .select("id, name, email")
      .eq("id", customerId)
      .single();

    if (!customer) continue;

    const customerName = customer.name || "不明";
    const customerEmail = customer.email;

    // メールがない場合はスキップ
    if (!customerEmail) {
      results.skipped_no_email++;
      continue;
    }

    // 重複チェック: notification_logs に既に送信済みか確認
    const { data: existingLogs } = await db
      .from("notification_logs")
      .select("id")
      .eq("type", "coaching_start_email")
      .eq("customer_id", customerId);

    if (existingLogs && existingLogs.length > 0) {
      results.skipped_duplicate++;
      continue;
    }

    // learning_records から coaching_end_date を取得
    const { data: learningRecord } = await db
      .from("learning_records")
      .select("coaching_end_date")
      .eq("customer_id", customerId)
      .single();

    const coachingEndDate = learningRecord?.coaching_end_date;

    // ============================================================
    // 3. coaching_end_date の有無で分岐
    // ============================================================
    if (!coachingEndDate || coachingEndDate === "-") {
      // coaching_end_date が未設定 → Slackアラート
      const alertMsg = [
        `<@U09KTDK1P99> cc: <@U03TF7YESK1>`,
        `以下受講者の指導期限日がありません。`,
        `${customerName}様`,
        `指導期限: 未設定`,
        `内容確認をお願い致します。`,
      ].join("\n");

      await sendSlackMessage(CUSTOMER_SUCCESS_CHANNEL, alertMsg);
      await logNotification({
        type: "coaching_start_email",
        channel: CUSTOMER_SUCCESS_CHANNEL,
        customer_id: customerId,
        message: alertMsg,
        status: "success",
        metadata: {
          action: "slack_alert_missing_end_date",
          coaching_date: coachingDate,
        },
      });
      results.slack_alerts++;
    } else {
      // coaching_end_date がある → メール送信
      const subject = "【Strategists】受講期間のご案内";
      const body = [
        `${customerName}様`,
        ``,
        `いつもお世話になっております。Strategists運営事務局でございます。`,
        `この度は、当塾のケース指導サービスにお申し込みいただき、誠にありがとうございます。`,
        ``,
        `本サービスは入会後、初回の指導日からマンツーマン指導の受講可能期間が開始となります。`,
        `◼︎${customerName}様のマンツーマン指導受講可能期間について`,
        `指導開始日: ${coachingDate}`,
        `指導期限: ${coachingEndDate}`,
        ``,
        `上記期間内で、マンツーマン指導をご受講ください。なお期間延長は1ヶ月あたり30000円（税込）で承りますが、講師の指導枠の都合上講師が変更となる場合もございます。`,
        ``,
        `${customerName}様の成長と目標達成を、講師・スタッフ一同、全力でサポートいたします。`,
        `ご不明な点がございましたら、お気軽にお問い合わせください。`,
        ``,
        `Strategists運営事務局`,
      ].join("\n");

      await sendEmail(customerEmail, subject, body);
      await logNotification({
        type: "coaching_start_email",
        recipient: customerEmail,
        customer_id: customerId,
        message: body.substring(0, 2000),
        status: "success",
        metadata: {
          action: "email_sent",
          coaching_date: coachingDate,
          coaching_end_date: coachingEndDate,
        },
      });
      results.emails_sent++;
    }
  }

  return NextResponse.json({
    ok: true,
    date: jstToday,
    results,
    timestamp: now.toISOString(),
  });
}
