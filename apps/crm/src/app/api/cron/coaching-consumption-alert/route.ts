import { createServiceClient } from "@/lib/supabase/server";
import { sendSlackMessage, isSystemAutomationEnabled } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** デフォルトチャンネル（edu-report） */
const DEFAULT_CHANNEL = "C094DA9A9B4";

/** 差分の閾値（パーセンテージポイント） */
const THRESHOLD = 25;

/** app_settings から通知設定を取得 */
async function getNotifyConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string | null> {
  const { data: enabledRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "slack_notify_coaching_consumption")
    .single();

  const enabled =
    enabledRow?.value != null
      ? typeof enabledRow.value === "string"
        ? enabledRow.value.replace(/"/g, "")
        : String(enabledRow.value)
      : "";

  // 明示的に "false" の場合のみ送信しない
  if (enabled === "false") return null;

  const { data: channelRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "slack_channel_coaching_consumption")
    .single();

  const channel =
    channelRow?.value != null
      ? typeof channelRow.value === "string"
        ? channelRow.value.replace(/"/g, "")
        : String(channelRow.value)
      : "";

  return channel || DEFAULT_CHANNEL;
}

/** 日本時間の「今」を取得 */
function nowJST(): Date {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

/** 対象月ラベル（例: "2026-03月"） */
function getMonthLabel(jst: Date): string {
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}月`;
}

interface LearningRow {
  coaching_start_date: string;
  coaching_end_date: string;
  total_sessions: number;
  completed_sessions: number;
  customer_id: string;
  customers: {
    id: string;
    name: string;
    email: string;
  };
}

interface AlertEntry {
  name: string;
  scheduleProgress: number;
  sessionProgress: number;
  diff: number;
  coachingEndDate: string;
  remainingDays: number;
  remainingSessions: number;
}

/**
 * GET /api/cron/coaching-consumption-alert
 * 月次指導消化率アラート（毎月1日実行）
 *
 * 日程消化率と指導消化率の差分が閾値以上の受講生を検出し、Slackに通知する。
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("coaching-consumption-alert"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const channel = await getNotifyConfig(supabase);
  if (!channel) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "notification disabled",
    });
  }

  // ================================================================
  // 1. アクティブな受講生データを取得
  // ================================================================
  const jst = nowJST();
  const todayStr = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;

  const { data: rows, error } = await supabase
    .from("learning_records")
    .select(
      `
      coaching_start_date,
      coaching_end_date,
      total_sessions,
      completed_sessions,
      customer_id,
      customers!inner (
        id,
        name,
        email
      )
    `
    )
    .not("coaching_end_date", "is", null)
    .gte("coaching_end_date", todayStr)
    .gt("total_sessions", 0);

  if (error) {
    console.error("Failed to fetch learning records:", error);
    return NextResponse.json(
      { error: "Database query failed", detail: error.message },
      { status: 500 }
    );
  }

  // sales_pipeline は learning_records と直接FK関係がないため、別クエリで取得し customer_id で紐付け
  const customerIds = (rows || []).map((r: { customer_id: string }) => r.customer_id).filter(Boolean);
  const pipelineMap = new Map<string, Array<{ stage: string; sales_person: string | null }>>();

  if (customerIds.length > 0) {
    const { data: pipelines } = await supabase
      .from("sales_pipeline")
      .select("customer_id, stage, sales_person")
      .in("customer_id", customerIds);

    for (const p of (pipelines || []) as { customer_id: string; stage: string; sales_person: string | null }[]) {
      if (!pipelineMap.has(p.customer_id)) {
        pipelineMap.set(p.customer_id, []);
      }
      pipelineMap.get(p.customer_id)!.push({ stage: p.stage, sales_person: p.sales_person });
    }
  }

  const validStages = new Set(["成約", "入金済", "追加指導"]);

  // ================================================================
  // 2. 各受講生の消化率を計算
  // ================================================================
  const alerts: AlertEntry[] = [];
  const nowMs = jst.getTime();

  for (const row of (rows || []) as (LearningRow & { customer_id: string })[]) {
    // ステージフィルタ: sales_pipeline のいずれかが有効ステージか
    const pipelines = pipelineMap.get(row.customer_id) || [];
    const hasValidStage = pipelines.some((sp) => validStages.has(sp.stage));
    if (!hasValidStage) continue;

    const startDate = new Date(row.coaching_start_date + "T00:00:00+09:00");
    const endDate = new Date(row.coaching_end_date + "T00:00:00+09:00");

    const totalDuration = endDate.getTime() - startDate.getTime();
    if (totalDuration <= 0) continue;

    const elapsed = nowMs - startDate.getTime();
    const scheduleProgress = Math.min(
      100,
      Math.max(0, (elapsed / totalDuration) * 100)
    );

    const sessionProgress =
      (row.completed_sessions / row.total_sessions) * 100;

    const diff = scheduleProgress - sessionProgress;

    if (diff >= THRESHOLD) {
      const remainingDays = Math.max(
        0,
        Math.ceil((endDate.getTime() - nowMs) / (1000 * 60 * 60 * 24))
      );
      const remainingSessions =
        row.total_sessions - row.completed_sessions;

      alerts.push({
        name: row.customers.name,
        scheduleProgress: Math.round(scheduleProgress),
        sessionProgress: Math.round(sessionProgress),
        diff: Math.round(diff),
        coachingEndDate: row.coaching_end_date,
        remainingDays,
        remainingSessions,
      });
    }
  }

  // ================================================================
  // 3. 差分降順でソート
  // ================================================================
  alerts.sort((a, b) => b.diff - a.diff);

  // ================================================================
  // 4. Slackメッセージ組み立て・送信
  // ================================================================
  const monthLabel = getMonthLabel(jst);
  const lines: string[] = [];

  if (alerts.length === 0) {
    lines.push(
      `【対象月：${monthLabel}】 指導消化率の差分 (閾値: ${THRESHOLD}%以上)`,
      "━━━━━━━━━━━━━━━━━━━━━━━━",
      "該当者なし"
    );
  } else {
    lines.push(
      `【対象月：${monthLabel}】 指導消化率の差分 (閾値: ${THRESHOLD}%以上)`,
      "━━━━━━━━━━━━━━━━━━━━━━━━"
    );

    for (const entry of alerts) {
      lines.push(
        `氏名: ${entry.name}`,
        `日程消化率: ${entry.scheduleProgress}%`,
        `指導消化率: ${entry.sessionProgress}%`,
        `指導期限: ${entry.coachingEndDate}`,
        `残り日数: ${entry.remainingDays}日`,
        `残り回数: ${entry.remainingSessions}回`,
        ""
      );
    }
  }

  const message = lines.join("\n");
  await sendSlackMessage(channel, message);

  return NextResponse.json({
    ok: true,
    month: monthLabel,
    count: alerts.length,
    timestamp: new Date().toISOString(),
  });
}
