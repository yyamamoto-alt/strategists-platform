import { createServiceClient } from "@/lib/supabase/server";
import {
  sendSlackMessage,
  sendSlackDM,
  getStaffSlackMapping,
  findSlackUserId,
  logNotification,
  isSystemAutomationEnabled,
} from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** CAリマインド通知先チャンネル (ca_report) */
const CA_REMINDER_CHANNEL = "C0ACH34578V";

/** エージェント対応中のアクティブステージ */
const ACTIVE_AGENT_STAGES = [
  "面談設定済",
  "書類選考中",
  "面接調整中",
  "面接実施済",
  "内定交渉中",
  "入社準備中",
  "カウンセリング済",
  "求人紹介中",
  "選考中",
  "検討中",
];

/**
 * GET /api/cron/ca-reminder
 * 毎朝のCA（キャリアアドバイザー）タスクリマインド:
 * - referral_category=フル利用/一部利用 の顧客をパイプラインからピックアップ
 * - 担当CA（sales_person）ごとにグループ化
 * - 各CAにDM + チャンネルにサマリー投稿
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("ca-reminder"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const mapping = await getStaffSlackMapping();

  // 7日後の日付（1週間前リマインド用）
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const sevenDaysLaterStr = sevenDaysLater.toISOString().slice(0, 10);

  const results = {
    total_customers: 0,
    cas_notified: 0,
    today_reminders: 0,
    upcoming_reminders: 0,
  };

  // エージェント利用者（referral_category=フル利用 or 一部利用）を contracts テーブルから取得
  const { data: agentCustomers, error: agentError } = await supabase
    .from("contracts")
    .select("customer_id")
    .in("referral_category", ["フル利用", "一部利用"]);

  if (agentError) {
    console.error("Agent records query error:", agentError);
    return NextResponse.json({ ok: false, error: agentError.message }, { status: 500 });
  }

  const agentCustomerIds = (agentCustomers || []).map((r: { customer_id: string }) => r.customer_id);

  if (agentCustomerIds.length === 0) {
    return NextResponse.json({
      ok: true,
      date: today,
      message: "対象顧客なし（エージェント利用者0名）",
      results,
      timestamp: now.toISOString(),
    });
  }

  const { data: targets, error } = await supabase
    .from("sales_pipeline")
    .select("id, customer_id, sales_person, stage, meeting_scheduled_date, customers!inner(name, email, attribute)")
    .in("customer_id", agentCustomerIds)
    .in("stage", ACTIVE_AGENT_STAGES);

  if (error) {
    console.error("CA reminder query error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({
      ok: true,
      date: today,
      message: "対象顧客なし",
      results,
      timestamp: now.toISOString(),
    });
  }

  // sales_person（CA）ごとにグループ化
  interface CustomerEntry {
    customerName: string;
    customerId: string;
    stage: string;
    attribute: string;
    meetingDate: string | null;
    isToday: boolean;
    isUpcoming: boolean;
  }

  const caGroups: Record<string, CustomerEntry[]> = {};

  for (const row of targets) {
    const salesPerson = row.sales_person || "未設定";
    const customerName = (row.customers as any)?.name || "不明";
    const attribute = (row.customers as any)?.attribute || "不明";
    const meetingDate = row.meeting_scheduled_date || null;
    const isToday = meetingDate === today;
    const isUpcoming = meetingDate === sevenDaysLaterStr;

    if (isToday) results.today_reminders++;
    if (isUpcoming) results.upcoming_reminders++;

    if (!caGroups[salesPerson]) {
      caGroups[salesPerson] = [];
    }
    caGroups[salesPerson].push({
      customerName,
      customerId: row.customer_id,
      stage: row.stage,
      attribute,
      meetingDate,
      isToday,
      isUpcoming,
    });
    results.total_customers++;
  }

  // 各CAにDM送信
  for (const [caName, customers] of Object.entries(caGroups)) {
    const slackUserId = findSlackUserId(caName, mapping);

    // 当日リマインド対象を先頭に表示
    const todayItems = customers.filter(c => c.isToday);
    const upcomingItems = customers.filter(c => c.isUpcoming);
    const otherItems = customers.filter(c => !c.isToday && !c.isUpcoming);

    const lines = [
      `📋 *CAリマインド（${today}）*`,
      `担当CA: ${caName}`,
      `対応中の顧客: ${customers.length}名`,
      ``,
    ];

    if (todayItems.length > 0) {
      lines.push(`🔴 *【本日対応】当日リマインド*`);
      for (const c of todayItems) {
        lines.push(
          `• ${c.customerName}（${c.attribute}）- ${c.stage}`,
          `  担当: ${caName} ｜ 面談日: ${c.meetingDate}`,
          `  https://strategists-crm.vercel.app/customers/${c.customerId}`,
        );
      }
      lines.push(``);
    }

    if (upcomingItems.length > 0) {
      lines.push(`🟡 *【1週間前リマインド】*`);
      for (const c of upcomingItems) {
        lines.push(
          `• ${c.customerName}（${c.attribute}）- ${c.stage}`,
          `  担当: ${caName} ｜ 面談予定日: ${c.meetingDate}`,
          `  https://strategists-crm.vercel.app/customers/${c.customerId}`,
        );
      }
      lines.push(``);
    }

    if (otherItems.length > 0) {
      lines.push(`📌 *対応中の顧客一覧*`);
      for (const c of otherItems) {
        lines.push(
          `• ${c.customerName}（${c.attribute}）- ${c.stage}`,
          `  https://strategists-crm.vercel.app/customers/${c.customerId}`,
        );
      }
    }

    const msg = lines.join("\n");

    if (slackUserId) {
      await sendSlackDM(slackUserId, msg);
      await logNotification({
        type: "ca_reminder",
        recipient: slackUserId,
        message: msg,
        status: "success",
        metadata: { ca_name: caName, customer_count: customers.length },
      });
      results.cas_notified++;
    }
  }

  // チャンネルにサマリー投稿
  const summaryLines = [
    `📋 *本日のCAリマインドサマリー（${today}）*`,
    ``,
  ];

  if (results.today_reminders > 0) {
    summaryLines.push(`🔴 *本日対応: ${results.today_reminders}件*`);
  }
  if (results.upcoming_reminders > 0) {
    summaryLines.push(`🟡 *1週間後予定: ${results.upcoming_reminders}件*`);
  }
  summaryLines.push(``);

  for (const [caName, customers] of Object.entries(caGroups)) {
    summaryLines.push(`*${caName}*: ${customers.length}名`);
    for (const c of customers) {
      const prefix = c.isToday ? "🔴" : c.isUpcoming ? "🟡" : "•";
      const dateInfo = c.meetingDate ? ` [面談: ${c.meetingDate}]` : "";
      summaryLines.push(`  ${prefix} ${c.customerName}（${c.attribute} / ${c.stage}）${dateInfo}`);
    }
    summaryLines.push(``);
  }

  summaryLines.push(`合計: ${results.total_customers}名`);

  await sendSlackMessage(CA_REMINDER_CHANNEL, summaryLines.join("\n"));

  return NextResponse.json({
    ok: true,
    date: today,
    results,
    timestamp: now.toISOString(),
  });
}
