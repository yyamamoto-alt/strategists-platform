import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
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
      if (s !== "問い合わせ") m.scheduled++;
      if (
        s === "面談実施" ||
        s === "提案中" ||
        s === "成約" ||
        s === "入金済"
      ) {
        m.conducted++;
      }
      if (s === "成約" || s === "入金済") {
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

    // 確定売上: スクール確定
    if (
      c.pipeline?.stage === "成約" ||
      c.pipeline?.stage === "入金済"
    ) {
      m.confirmed_revenue += amount;
    }
    m.projected_revenue += c.pipeline?.projected_amount || amount;

    const isClosed =
      c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済";

    // セグメント分類: 成約済みの実績ベース
    if (isClosed) {
      m.school_revenue += amount;
    }

    // エージェント売上: 人材紹介区分が「フル利用」or「一部利用」のみ
    if (isAgentCustomer(c)) {
      if (isAgentConfirmed(c)) {
        m.agent_revenue += calcExpectedReferralFee(c);
      } else if (isCurrentlyEnrolled(c)) {
        const fee = calcExpectedReferralFee(c);
        const cat = c.contract?.referral_category;
        m.agent_revenue += cat === "一部利用" ? Math.round(fee * 0.5) : fee;
      }
    }

    // 補助金: 成約済みのみ
    if (isClosed) {
      const subsidy = getSubsidyAmount(c);
      if (subsidy > 0) {
        m.other_revenue += subsidy;
      }
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
    const isClosed =
      c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済";

    // --- Tier 1: 確定売上 ---
    if (isClosed) {
      m.confirmed_school += amount;
      m.closed_count++;
    }

    // エージェント確定分
    if (isAgentCustomer(c) && isAgentConfirmed(c)) {
      m.confirmed_agent += calcExpectedReferralFee(c);
    }

    // 補助金
    if (isClosed) {
      m.confirmed_subsidy += getSubsidyAmount(c);
    }

    // --- Tier 2: エージェント見込み（受講中のみ、確定除外） ---
    if (
      isAgentCustomer(c) &&
      isCurrentlyEnrolled(c) &&
      !isAgentConfirmed(c)
    ) {
      m.projected_agent += calcExpectedReferralFee(c);
    }

    // --- Tier 3: パイプライン予測用 ---
    if (c.pipeline && !isClosed) {
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

    if (c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済") {
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

export async function fetchDashboardData() {
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

  const closedCount =
    (stageCounts["成約"] || 0) + (stageCounts["入金済"] || 0);
  const lostCount = stageCounts["失注"] || 0;
  const activeDeals =
    (totalCustomers || 0) - closedCount - lostCount;

  return {
    totalCustomers: totalCustomers || 0,
    closedCount,
    activeDeals,
    stageCounts,
  };
}
