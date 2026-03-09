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

/** CAリマインド通知先チャンネル */
const CA_REMINDER_CHANNEL = "C094YLMKR4K";

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
 * - agent_service_enrolled=true の顧客をパイプラインからピックアップ
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

  const results = {
    total_customers: 0,
    cas_notified: 0,
  };

  // agent_service_enrolled=true の顧客でアクティブなパイプラインを取得
  // agent_service_enrolled は agent_records テーブルにあるため、先にエージェント利用中の顧客IDを取得
  const { data: agentCustomers, error: agentError } = await supabase
    .from("agent_records")
    .select("customer_id")
    .eq("agent_service_enrolled", true);

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
    .select("id, customer_id, sales_person, stage, customers!inner(name, email)")
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
  const caGroups: Record<string, Array<{
    customerName: string;
    customerId: string;
    stage: string;
  }>> = {};

  for (const row of targets) {
    const salesPerson = row.sales_person || "未設定";
    const customerName = (row.customers as any)?.name || "不明";

    if (!caGroups[salesPerson]) {
      caGroups[salesPerson] = [];
    }
    caGroups[salesPerson].push({
      customerName,
      customerId: row.customer_id,
      stage: row.stage,
    });
    results.total_customers++;
  }

  // 各CAにDM送信
  for (const [caName, customers] of Object.entries(caGroups)) {
    const slackUserId = findSlackUserId(caName, mapping);

    const lines = [
      `📋 *CAリマインド（${today}）*`,
      `担当: ${caName}`,
      `対応が必要な顧客: ${customers.length}名`,
      ``,
    ];

    for (const c of customers) {
      lines.push(
        `• ${c.customerName}（${c.stage}）`,
        `  https://strategists-crm.vercel.app/customers/${c.customerId}`,
      );
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

  for (const [caName, customers] of Object.entries(caGroups)) {
    summaryLines.push(`*${caName}*: ${customers.length}名`);
    for (const c of customers) {
      summaryLines.push(`  • ${c.customerName}（${c.stage}）`);
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
