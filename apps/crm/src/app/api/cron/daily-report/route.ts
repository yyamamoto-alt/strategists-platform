import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetrics,
  computeThreeTierRevenue,
  computeAgentRevenueSummary,
} from "@/lib/data/dashboard-metrics";
import { notifyDailyReport, isSystemAutomationEnabled } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fmtCurrency(n: number): string {
  if (n >= 10000) return `¥${Math.round(n / 10000).toLocaleString()}万`;
  return `¥${n.toLocaleString()}`;
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * GET /api/cron/daily-report
 * 毎朝の売上レポートをSlackに配信（Zapier「売り上げ見込みレポート」の移管）
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("daily-report"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const customers = await fetchCustomersWithRelations();

  // 当月の期間キー
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;

  // 3段階売上
  const threeTier = computeThreeTierRevenue(customers);
  const currentMonth = threeTier.find((t) => t.period === currentPeriod);

  // ファネル
  const funnel = computeFunnelMetrics(customers);
  const currentFunnel = funnel.find((f) => f.period === currentPeriod);

  // エージェント
  const agentSummary = computeAgentRevenueSummary(customers);

  // 前月比較
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPeriod = `${prevMonth.getFullYear()}/${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  const prevMonthData = threeTier.find((t) => t.period === prevPeriod);

  const dateStr = now.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  });

  const lines: string[] = [
    `📊 *日次売上レポート* — ${dateStr}`,
    "",
  ];

  // 当月サマリー
  if (currentMonth) {
    lines.push(`*【${currentPeriod} 売上状況】*`);
    lines.push(`  確定売上: ${fmtCurrency(currentMonth.confirmed_total)}`);
    lines.push(`    スクール: ${fmtCurrency(currentMonth.confirmed_school)}（既卒 ${fmtCurrency(currentMonth.confirmed_school_kisotsu)} / 新卒 ${fmtCurrency(currentMonth.confirmed_school_shinsotsu)}）`);
    lines.push(`    人材確定: ${fmtCurrency(currentMonth.confirmed_agent)}`);
    lines.push(`    補助金: ${fmtCurrency(currentMonth.confirmed_subsidy)}`);
    lines.push(`  見込含む: ${fmtCurrency(currentMonth.projected_total)}（人材見込: ${fmtCurrency(currentMonth.projected_agent)}）`);
    lines.push(`  予測売上: ${fmtCurrency(currentMonth.forecast_total)}`);
    lines.push("");
  }

  // ファネル
  if (currentFunnel) {
    lines.push(`*【${currentPeriod} ファネル】*`);
    lines.push(`  申込: ${currentFunnel.applications}件 → 実施: ${currentFunnel.conducted}件 → 成約: ${currentFunnel.closed}件`);
    lines.push(`  実施率: ${fmtPct(currentFunnel.conduct_rate)} / 成約率: ${fmtPct(currentFunnel.closing_rate)}`);
    lines.push("");
  }

  // 人材紹介
  lines.push(`*【人材紹介】*`);
  lines.push(`  確定: ${fmtCurrency(agentSummary.total_confirmed_fee)}（${agentSummary.confirmed_count}名）`);
  lines.push(`  見込: ${fmtCurrency(agentSummary.total_projected_fee)}（${agentSummary.in_progress_count}名）`);
  lines.push("");

  // 前月実績
  if (prevMonthData) {
    lines.push(`*【前月実績 ${prevPeriod}】*`);
    lines.push(`  確定: ${fmtCurrency(prevMonthData.confirmed_total)} / 見込含む: ${fmtCurrency(prevMonthData.projected_total)}`);
  }

  await notifyDailyReport(lines.join("\n"));

  return NextResponse.json({
    ok: true,
    period: currentPeriod,
    timestamp: now.toISOString(),
  });
}
