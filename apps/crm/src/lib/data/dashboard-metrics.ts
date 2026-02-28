import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import type {
  FunnelMetrics,
  RevenueMetrics,
  ChannelMetrics,
  CustomerWithRelations,
  ThreeTierRevenue,
  AgentRevenueSummary,
  QuarterlyForecast,
} from "@strategy-school/shared-db";

// ================================================================
// ヘルパー（calc-fields.ts から import: client-safe にも使えるように分離）
// ================================================================

import {
  calcExpectedReferralFee,
  isAgentCustomer,
  isCurrentlyEnrolled,
  isAgentConfirmed,
  getSubsidyAmount,
  calcAgentProjectedRevenue,
} from "@/lib/calc-fields";

/** 成約判定: 実データのステージ値に対応 */
function isStageClosed(stage: string | undefined | null): boolean {
  if (!stage) return false;
  return (
    stage === "成約" ||
    stage === "入金済" ||
    stage === "その他購入" ||
    stage === "動画講座購入" ||
    stage === "追加指導" ||
    stage.includes("成約見込")
  );
}

/** 期間文字列を取得（Excel PL準拠: 申込月ベース） */
function getPeriod(c: CustomerWithRelations): string | null {
  const date = c.application_date || c.pipeline?.closing_date;
  if (!date) return null;
  return date.slice(0, 7).replace("-", "/");
}

/** 四半期文字列を取得 "2025/Q1" */
function getQuarter(period: string): string {
  const [year, month] = period.split("/");
  const q = Math.ceil(Number(month) / 3);
  return `${year}/Q${q}`;
}

// ================================================================
// ファネルメトリクス（既存 - 変更なし）
// ================================================================

export function computeFunnelMetrics(
  customers: CustomerWithRelations[]
): FunnelMetrics[] {
  const byMonth = new Map<
    string,
    { applications: number; scheduled: number; conducted: number; closed: number }
  >();

  for (const c of customers) {
    const date = c.application_date;
    if (!date) continue;
    const period = date.slice(0, 7).replace("-", "/");

    if (!byMonth.has(period)) {
      byMonth.set(period, { applications: 0, scheduled: 0, conducted: 0, closed: 0 });
    }
    const m = byMonth.get(period)!;
    m.applications++;

    if (c.pipeline) {
      const s = c.pipeline.stage;
      const dealStatus = c.pipeline.deal_status;
      // 日程確定以降（日程未確以外すべて）
      if (s !== "日程未確") m.scheduled++;
      // 面談実施: deal_status が「実施」を含む or 成約系ステージ
      if (
        dealStatus === "実施" ||
        isStageClosed(s)
      ) {
        m.conducted++;
      }
      // 成約判定
      if (isStageClosed(s)) {
        m.closed++;
      }
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, m]) => ({
      period,
      ...m,
      scheduling_rate: m.applications > 0 ? m.scheduled / m.applications : 0,
      conduct_rate: m.scheduled > 0 ? m.conducted / m.scheduled : 0,
      closing_rate: m.conducted > 0 ? m.closed / m.conducted : 0,
    }));
}

// ================================================================
// 旧 RevenueMetrics（後方互換 - ダッシュボードチャートで使用）
// ================================================================

export function computeRevenueMetrics(
  customers: CustomerWithRelations[]
): RevenueMetrics[] {
  const byMonth = new Map<
    string,
    {
      confirmed_revenue: number;
      projected_revenue: number;
      school_revenue: number;
      agent_revenue: number;
      content_revenue: number;
      other_revenue: number;
    }
  >();

  for (const c of customers) {
    const period = getPeriod(c);
    if (!period) continue;

    if (!byMonth.has(period)) {
      byMonth.set(period, {
        confirmed_revenue: 0,
        projected_revenue: 0,
        school_revenue: 0,
        agent_revenue: 0,
        content_revenue: 0,
        other_revenue: 0,
      });
    }
    const m = byMonth.get(period)!;
    const amount = c.contract?.confirmed_amount || 0;

    const closed = isStageClosed(c.pipeline?.stage);

    // 確定売上: スクール確定
    if (closed) {
      m.confirmed_revenue += amount;
    }

    // 人材見込み: 人材紹介顧客のみ
    const agentFee = isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0;
    const subsidy = closed ? getSubsidyAmount(c) : 0;
    m.projected_revenue += (closed ? amount : 0) + agentFee + subsidy;

    // セグメント分類: 成約済みの実績ベース
    if (closed) {
      m.school_revenue += amount;
    }

    // エージェント売上: 人材紹介顧客のみ
    m.agent_revenue += agentFee;

    // 補助金: 成約済みのみ
    if (closed && subsidy > 0) {
      m.other_revenue += subsidy;
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, m]) => ({ period, ...m }));
}

// ================================================================
// 3段階売上メトリクス（Excel PL シート再現）
// ================================================================

export function computeThreeTierRevenue(
  customers: CustomerWithRelations[]
): ThreeTierRevenue[] {
  const byMonth = new Map<
    string,
    {
      confirmed_school: number;
      confirmed_school_kisotsu: number;
      confirmed_school_shinsotsu: number;
      confirmed_agent: number;
      confirmed_subsidy: number;
      projected_agent: number;
      pipeline_projected: number;
      pipeline_count: number;
      closed_count: number;
    }
  >();

  // 全体の成約率（予測に使用）
  const totalClosed = customers.filter(
    (c) => c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済"
  ).length;
  const totalWithPipeline = customers.filter((c) => c.pipeline).length;
  const overallClosingRate =
    totalWithPipeline > 0 ? totalClosed / totalWithPipeline : 0;

  for (const c of customers) {
    const period = getPeriod(c);
    if (!period) continue;

    if (!byMonth.has(period)) {
      byMonth.set(period, {
        confirmed_school: 0,
        confirmed_school_kisotsu: 0,
        confirmed_school_shinsotsu: 0,
        confirmed_agent: 0,
        confirmed_subsidy: 0,
        projected_agent: 0,
        pipeline_projected: 0,
        pipeline_count: 0,
        closed_count: 0,
      });
    }
    const m = byMonth.get(period)!;
    const amount = c.contract?.confirmed_amount || 0;
    const closed = isStageClosed(c.pipeline?.stage);

    // --- Tier 1: 確定売上 ---
    if (closed) {
      m.confirmed_school += amount;
      // 既卒/新卒セグメント分離
      if (c.attribute?.includes('新卒')) {
        m.confirmed_school_shinsotsu += amount;
      } else {
        m.confirmed_school_kisotsu += amount;
      }
      m.closed_count++;
    }

    // エージェント確定分（人材紹介顧客のみ）
    if (isAgentCustomer(c) && isAgentConfirmed(c)) {
      m.confirmed_agent += calcExpectedReferralFee(c);
    }

    // 補助金
    if (closed) {
      m.confirmed_subsidy += getSubsidyAmount(c);
    }

    // --- Tier 2: 人材見込み（人材紹介顧客のみ、確定除外） ---
    if (isAgentCustomer(c) && !isAgentConfirmed(c)) {
      const fee = calcExpectedReferralFee(c);
      if (fee > 0) {
        m.projected_agent += fee;
      }
    }

    // --- Tier 3: パイプライン予測用 ---
    if (c.pipeline && !closed) {
      m.pipeline_projected += c.pipeline.projected_amount || amount || 0;
      m.pipeline_count++;
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, m]) => {
      const confirmedTotal =
        m.confirmed_school + m.confirmed_agent + m.confirmed_subsidy;
      const projectedTotal = confirmedTotal + m.projected_agent;
      // Tier 3: 確定 + 見込み + パイプラインの期待値（成約率 × projected_amount）
      const forecastTotal =
        projectedTotal + m.pipeline_projected * overallClosingRate;

      return {
        period,
        confirmed_school: m.confirmed_school,
        confirmed_school_kisotsu: m.confirmed_school_kisotsu,
        confirmed_school_shinsotsu: m.confirmed_school_shinsotsu,
        confirmed_agent: m.confirmed_agent,
        confirmed_subsidy: m.confirmed_subsidy,
        confirmed_total: confirmedTotal,
        projected_agent: m.projected_agent,
        projected_total: projectedTotal,
        forecast_total: Math.round(forecastTotal),
      };
    });
}

// ================================================================
// エージェント売上サマリー
// ================================================================

export function computeAgentRevenueSummary(
  customers: CustomerWithRelations[]
): AgentRevenueSummary {
  const agentCustomers = customers.filter(isAgentCustomer);

  let totalExpected = 0;
  let totalConfirmed = 0;
  let totalProjected = 0;
  let confirmedCount = 0;
  let inProgressCount = 0;
  let salarySum = 0;
  let salaryCount = 0;
  let feeRateSum = 0;
  let feeRateCount = 0;

  for (const c of agentCustomers) {
    const fee = calcExpectedReferralFee(c);
    totalExpected += fee;

    if (isAgentConfirmed(c)) {
      totalConfirmed += fee;
      confirmedCount++;
    } else if (isCurrentlyEnrolled(c)) {
      totalProjected += fee;
      inProgressCount++;
    }

    if (c.agent?.offer_salary && c.agent.offer_salary > 0) {
      salarySum += c.agent.offer_salary;
      salaryCount++;
    }
    if (c.agent?.referral_fee_rate && c.agent.referral_fee_rate > 0) {
      feeRateSum += c.agent.referral_fee_rate;
      feeRateCount++;
    }
  }

  return {
    total_expected_fee: totalExpected,
    total_confirmed_fee: totalConfirmed,
    total_projected_fee: totalProjected,
    active_agent_count: agentCustomers.length,
    confirmed_count: confirmedCount,
    in_progress_count: inProgressCount,
    avg_expected_salary: salaryCount > 0 ? Math.round(salarySum / salaryCount) : 0,
    avg_referral_fee_rate: feeRateCount > 0 ? feeRateSum / feeRateCount : 0,
  };
}

// ================================================================
// 四半期予測
// ================================================================

export function computeQuarterlyForecast(
  customers: CustomerWithRelations[]
): QuarterlyForecast[] {
  const threeTier = computeThreeTierRevenue(customers);
  const funnel = computeFunnelMetrics(customers);

  const byQuarter = new Map<
    string,
    {
      confirmed: number;
      projected: number;
      forecast: number;
      school: number;
      agent: number;
      closings: number;
      applications: number;
    }
  >();

  for (const t of threeTier) {
    const q = getQuarter(t.period);
    if (!byQuarter.has(q)) {
      byQuarter.set(q, {
        confirmed: 0,
        projected: 0,
        forecast: 0,
        school: 0,
        agent: 0,
        closings: 0,
        applications: 0,
      });
    }
    const m = byQuarter.get(q)!;
    m.confirmed += t.confirmed_total;
    m.projected += t.projected_total;
    m.forecast += t.forecast_total;
    m.school += t.confirmed_school;
    m.agent += t.confirmed_agent + t.projected_agent;
  }

  for (const f of funnel) {
    const q = getQuarter(f.period);
    const m = byQuarter.get(q);
    if (m) {
      m.closings += f.closed;
      m.applications += f.applications;
    }
  }

  return Array.from(byQuarter.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, m]) => ({
      quarter,
      confirmed_revenue: m.confirmed,
      projected_revenue: m.projected,
      forecast_revenue: m.forecast,
      school_revenue: m.school,
      agent_revenue: m.agent,
      closings: m.closings,
      applications: m.applications,
    }));
}

// ================================================================
// チャネルメトリクス（既存 - 変更なし）
// ================================================================

export function computeChannelMetrics(
  customers: CustomerWithRelations[]
): ChannelMetrics[] {
  const byChannel = new Map<
    string,
    { applications: number; closings: number; revenue: number }
  >();

  for (const c of customers) {
    const channel = c.utm_source || "その他";

    if (!byChannel.has(channel)) {
      byChannel.set(channel, { applications: 0, closings: 0, revenue: 0 });
    }
    const m = byChannel.get(channel)!;
    m.applications++;

    if (isStageClosed(c.pipeline?.stage)) {
      m.closings++;
      m.revenue += c.contract?.confirmed_amount || 0;
    }
  }

  return Array.from(byChannel.entries())
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .map(([channel, m]) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel: channel as any,
      ...m,
      cpa: 0,
      ltv: m.closings > 0 ? Math.round(m.revenue / m.closings) : 0,
    }));
}

// ================================================================
// ダッシュボード直接集計（既存）
// ================================================================

async function fetchDashboardDataRaw() {
  const supabase = createServiceClient();

  const { count: totalCustomers } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true });

  const { data: pipelineData } = await supabase
    .from("sales_pipeline")
    .select("stage") as { data: { stage: string }[] | null };

  const stageCounts: Record<string, number> = {};
  for (const p of pipelineData || []) {
    stageCounts[p.stage] = (stageCounts[p.stage] || 0) + 1;
  }

  const closedStages = ["成約", "入金済", "その他購入", "動画講座購入", "追加指導"];
  let closedCount = 0;
  for (const s of closedStages) {
    closedCount += stageCounts[s] || 0;
  }
  // 成約見込(未入金) もカウント
  for (const [s, count] of Object.entries(stageCounts)) {
    if (s.includes("成約見込")) closedCount += count;
  }
  const lostCount = (stageCounts["失注"] || 0) + (stageCounts["失注見込"] || 0) + (stageCounts["失注見込(自動)"] || 0) + (stageCounts["CL"] || 0) + (stageCounts["全額返金"] || 0);
  const activeDeals =
    (totalCustomers || 0) - closedCount - lostCount;

  return {
    totalCustomers: totalCustomers || 0,
    closedCount,
    activeDeals,
    stageCounts,
  };
}

/** キャッシュ付きダッシュボードデータ取得（60秒間キャッシュ） */
export const fetchDashboardData = unstable_cache(
  fetchDashboardDataRaw,
  ["dashboard-data"],
  { revalidate: 60 }
);
