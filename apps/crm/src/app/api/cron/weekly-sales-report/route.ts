import { createServiceClient } from "@/lib/supabase/server";
import { sendSlackMessage, isSystemAutomationEnabled } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** デフォルトチャンネル（営業レポート） */
const DEFAULT_CHANNEL = "C094YLMKR4K";

/** app_settings から通知設定を取得 */
async function getNotifyChannel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string | null> {
  const { data: enabledRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "slack_notify_weekly_sales_report")
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
    .eq("key", "slack_channel_weekly_sales_report")
    .single();

  const channel =
    channelRow?.value != null
      ? typeof channelRow.value === "string"
        ? channelRow.value.replace(/"/g, "")
        : String(channelRow.value)
      : "";

  return channel || DEFAULT_CHANNEL;
}

/** 今週（月曜〜日曜）の期間を日本時間で算出 */
function getWeekBoundariesJST(): { start: string; end: string; label: string } {
  // 日本時間の「今」を取得
  const nowUtc = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const nowJst = new Date(nowUtc.getTime() + jstOffset);

  const year = nowJst.getUTCFullYear();
  const month = nowJst.getUTCMonth();
  const date = nowJst.getUTCDate();
  const day = nowJst.getUTCDay(); // 0=Sun .. 6=Sat

  // 今週の月曜日（day=0(日)なら -6、それ以外は -(day-1)）
  const diffToMonday = day === 0 ? -6 : -(day - 1);
  const monday = new Date(Date.UTC(year, month, date + diffToMonday));
  const sunday = new Date(Date.UTC(year, month, date + diffToMonday + 6));

  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  const fmtJa = (d: Date) =>
    `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;

  return {
    start: fmt(monday),
    end: fmt(sunday),
    label: `${fmtJa(monday)}〜${fmtJa(sunday)}`,
  };
}

function fmtPct(n: number): string {
  if (isNaN(n) || !isFinite(n)) return "0%";
  return `${Math.round(n * 100)}%`;
}

/**
 * GET /api/cron/weekly-sales-report
 * 週次営業KPIレポートをSlackに配信（Zapier「営業レポート」の移管）
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("weekly-sales-report"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const channel = await getNotifyChannel(supabase);
  if (!channel) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "notification disabled",
    });
  }

  const { start, end, label } = getWeekBoundariesJST();

  // ================================================================
  // sales_pipeline + customers を結合して今週のデータを取得
  // ================================================================

  // 今週の新規申込（application_date ベース）
  const { data: newApplications } = await supabase
    .from("sales_pipeline")
    .select("id, customers!inner(application_date)")
    .gte("customers.application_date", start)
    .lte("customers.application_date", end);

  const newApplicationCount = newApplications?.length ?? 0;

  // 今週の面談実施（interview_date が今週の範囲内）
  const { data: interviews } = await supabase
    .from("sales_pipeline")
    .select("id, interview_date")
    .gte("interview_date", start)
    .lte("interview_date", end);

  const interviewCount = interviews?.length ?? 0;

  // 今週の成約（stage = "成約" かつ updated_at が今週）
  const { data: closedDeals } = await supabase
    .from("sales_pipeline")
    .select("id, updated_at")
    .eq("stage", "成約")
    .gte("updated_at", `${start}T00:00:00+09:00`)
    .lte("updated_at", `${end}T23:59:59+09:00`);

  const closedCount = closedDeals?.length ?? 0;

  // ================================================================
  // 営業担当者別の実績
  // ================================================================

  // 今週アクティブな全パイプライン（担当者別集計用）
  const { data: allPipeline } = await supabase
    .from("sales_pipeline")
    .select("id, sales_person, stage, updated_at, customers!inner(application_date)")
    .or(
      [
        `customers.application_date.gte.${start},customers.application_date.lte.${end}`,
        `updated_at.gte.${start}T00:00:00+09:00`,
      ].join(",")
    );

  // 担当者別にグルーピング
  interface PersonStats {
    deals: number;
    closed: number;
  }
  const personMap = new Map<string, PersonStats>();

  if (allPipeline) {
    for (const row of allPipeline) {
      const person = row.sales_person || "未設定";
      if (!personMap.has(person)) {
        personMap.set(person, { deals: 0, closed: 0 });
      }
      const stats = personMap.get(person)!;
      stats.deals++;

      if (
        row.stage === "成約" &&
        row.updated_at >= `${start}T00:00:00` &&
        row.updated_at <= `${end}T23:59:59`
      ) {
        stats.closed++;
      }
    }
  }

  // ================================================================
  // Slackメッセージ組み立て
  // ================================================================

  const lines: string[] = [
    `📈 *週次営業レポート* — ${label}`,
    "",
    "*【今週の実績】*",
    `  新規申込: ${newApplicationCount}件`,
    `  面談実施: ${interviewCount}件`,
    `  成約: ${closedCount}件`,
    "",
  ];

  // 担当者別実績
  if (personMap.size > 0) {
    lines.push("*【営業担当者別】*");

    // 成約数降順 → 案件数降順でソート
    const sorted = (Array.from(personMap.entries()) as [string, PersonStats][]).sort((a, b) => {
      if (b[1].closed !== a[1].closed) return b[1].closed - a[1].closed;
      return b[1].deals - a[1].deals;
    });

    for (const [person, stats] of sorted) {
      const rate = stats.deals > 0 ? stats.closed / stats.deals : 0;
      lines.push(
        `  ${person}: 担当 ${stats.deals}件 / 成約 ${stats.closed}件（成約率 ${fmtPct(rate)}）`
      );
    }
    lines.push("");
  }

  // 全体成約率
  if (newApplicationCount > 0) {
    const overallRate = closedCount / newApplicationCount;
    lines.push(`*全体成約率: ${fmtPct(overallRate)}*`);
  }

  const message = lines.join("\n");
  await sendSlackMessage(channel, message);

  // 経営reportチャンネルにも送信（Zapier準拠: C09EYNUMQ8K）
  const REPORT_CHANNEL = "C09EYNUMQ8K";
  if (channel !== REPORT_CHANNEL) {
    await sendSlackMessage(REPORT_CHANNEL, message);
  }

  return NextResponse.json({
    ok: true,
    week: label,
    metrics: {
      new_applications: newApplicationCount,
      interviews: interviewCount,
      closed: closedCount,
      sales_persons: personMap.size,
    },
    timestamp: new Date().toISOString(),
  });
}
