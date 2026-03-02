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
  ChannelFunnelPivot,
  PLSheetData,
  PLSegmentData,
  PLChannelData,
  PLFunnelCounts,
} from "@strategy-school/shared-db";

// ================================================================
// ヘルパー（calc-fields.ts から import: client-safe にも使えるように分離）
// ================================================================

import {
  calcExpectedReferralFee,
  calcClosingProbability,
  isAgentCustomer,
  isCurrentlyEnrolled,
  isAgentConfirmed,
  getSubsidyAmount,
  calcAgentProjectedRevenue,
  isShinsotsu,
} from "@/lib/calc-fields";

/** 集計対象開始日: これより前の申込は集計から除外（データはDB保持） */
const ANALYTICS_START_DATE = "2024-01-01";

/** 集計対象期間フィルタ */
function filterByAnalyticsPeriod(
  customers: CustomerWithRelations[]
): CustomerWithRelations[] {
  return customers.filter(
    (c) => c.application_date && c.application_date >= ANALYTICS_START_DATE
  );
}

/** 成約判定: 「成約」「入金済」のみ。動画講座購入/その他購入/追加指導/成約見込は除外 */
function isStageClosed(stage: string | undefined | null): boolean {
  if (!stage) return false;
  return stage === "成約" || stage === "入金済";
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
  const filtered = filterByAnalyticsPeriod(customers);
  const byMonth = new Map<
    string,
    { applications: number; scheduled: number; conducted: number; closed: number }
  >();

  for (const c of filtered) {
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
  customers = filterByAnalyticsPeriod(customers);
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

/** 直近N月のファネル成約率を計算（実施→成約ベース） */
function computeRecentClosingRate(
  customers: CustomerWithRelations[],
  recentMonths: number = 3
): number {
  // 月別のファネルデータを集計
  const byMonth = new Map<string, { conducted: number; closed: number }>();

  for (const c of customers) {
    const date = c.application_date;
    if (!date) continue;
    const period = date.slice(0, 7).replace("-", "/");
    if (!byMonth.has(period)) {
      byMonth.set(period, { conducted: 0, closed: 0 });
    }
    const m = byMonth.get(period)!;
    if (!c.pipeline) continue;
    const s = c.pipeline.stage;
    const dealStatus = c.pipeline.deal_status;
    // 実施済み: deal_status="実施" or 成約系ステージ
    if (dealStatus === "実施" || isStageClosed(s)) {
      m.conducted++;
    }
    if (isStageClosed(s)) {
      m.closed++;
    }
  }

  // 直近N月のデータを取得（当月は除外 — 未完データなので）
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const sortedPeriods = Array.from(byMonth.keys())
    .filter((p) => p < currentPeriod)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, recentMonths);

  let totalConducted = 0;
  let totalClosed = 0;
  for (const p of sortedPeriods) {
    const m = byMonth.get(p)!;
    totalConducted += m.conducted;
    totalClosed += m.closed;
  }

  // 直近データがない場合は全体平均にフォールバック
  if (totalConducted === 0) {
    const allConducted = Array.from(byMonth.values()).reduce((s, m) => s + m.conducted, 0);
    const allClosed = Array.from(byMonth.values()).reduce((s, m) => s + m.closed, 0);
    return allConducted > 0 ? allClosed / allConducted : 0;
  }

  return totalClosed / totalConducted;
}

/** 当月の日数進捗補正係数を計算 */
function getMonthProgressMultiplier(period: string): number {
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;

  if (period !== currentPeriod) return 1; // 過去月は補正不要

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // 最低1日（0除算防止）
  return dayOfMonth > 0 ? daysInMonth / dayOfMonth : 1;
}

export function computeThreeTierRevenue(
  customers: CustomerWithRelations[]
): ThreeTierRevenue[] {
  customers = filterByAnalyticsPeriod(customers);
  const byMonth = new Map<
    string,
    {
      confirmed_school: number;
      confirmed_school_kisotsu: number;
      confirmed_school_shinsotsu: number;
      confirmed_agent: number;
      confirmed_subsidy: number;
      projected_agent: number;
      // Tier 3: ステージ別確率に基づく期待値
      forecast_school: number;
      forecast_agent: number;
      forecast_subsidy: number;
    }
  >();

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
        forecast_school: 0,
        forecast_agent: 0,
        forecast_subsidy: 0,
      });
    }
    const m = byMonth.get(period)!;
    const amount = c.contract?.confirmed_amount || 0;
    const closed = isStageClosed(c.pipeline?.stage);

    // --- Tier 1: 確定売上 ---
    if (closed) {
      m.confirmed_school += amount;
      if (isShinsotsu(c.attribute)) {
        m.confirmed_school_shinsotsu += amount;
      } else {
        m.confirmed_school_kisotsu += amount;
      }
    }

    // エージェント確定分
    if (isAgentCustomer(c) && isAgentConfirmed(c)) {
      m.confirmed_agent += calcExpectedReferralFee(c);
    }

    // 補助金
    if (closed) {
      m.confirmed_subsidy += getSubsidyAmount(c);
    }

    // --- Tier 2: 人材見込み（確定除外） ---
    if (isAgentCustomer(c) && !isAgentConfirmed(c)) {
      const fee = calcExpectedReferralFee(c);
      if (fee > 0) {
        m.projected_agent += fee;
      }
    }

    // --- Tier 3: ステージ別成約確率ベースの予測 ---
    if (!closed) {
      const prob = calcClosingProbability(c);
      if (prob > 0) {
        // スクール売上期待値
        const potentialSchool = amount > 0 ? amount :
          (isShinsotsu(c.attribute) ? 240000 : 427636);
        m.forecast_school += potentialSchool * prob;
        // エージェント売上期待値
        if (isAgentCustomer(c)) {
          m.forecast_agent += calcExpectedReferralFee(c) * prob;
        }
        // 補助金期待値
        m.forecast_subsidy += getSubsidyAmount(c) * prob;
      }
    }
  }

  // 当月を必ず含める
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (!byMonth.has(currentPeriod)) {
    byMonth.set(currentPeriod, {
      confirmed_school: 0, confirmed_school_kisotsu: 0,
      confirmed_school_shinsotsu: 0, confirmed_agent: 0,
      confirmed_subsidy: 0, projected_agent: 0,
      forecast_school: 0, forecast_agent: 0, forecast_subsidy: 0,
    });
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, m]) => {
      const confirmedTotal =
        m.confirmed_school + m.confirmed_agent + m.confirmed_subsidy;
      const projectedTotal = confirmedTotal + m.projected_agent;

      // Tier 3: 確定 + 未成約パイプラインの期待値（ステージ別確率）
      const forecastTotal =
        confirmedTotal + m.forecast_school + m.forecast_agent + m.forecast_subsidy;

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

/** ファネルメトリクスをセグメント別に計算 */
export function computeFunnelMetricsBySegment(
  customers: CustomerWithRelations[]
): { all: FunnelMetrics[]; kisotsu: FunnelMetrics[]; shinsotsu: FunnelMetrics[] } {
  return {
    all: computeFunnelMetrics(customers),
    kisotsu: computeFunnelMetrics(customers.filter(c => !isShinsotsu(c.attribute))),
    shinsotsu: computeFunnelMetrics(customers.filter(c => isShinsotsu(c.attribute))),
  };
}

// ================================================================
// エージェント売上サマリー
// ================================================================

export function computeAgentRevenueSummary(
  customers: CustomerWithRelations[]
): AgentRevenueSummary {
  const agentCustomers = filterByAnalyticsPeriod(customers).filter(isAgentCustomer);

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
// チャネルメトリクス（帰属データ対応版）
// ================================================================

import type { ChannelAttribution } from "@/lib/data/marketing-settings";

export function computeChannelMetrics(
  customers: CustomerWithRelations[],
  attributionMap?: Record<string, ChannelAttribution>
): ChannelMetrics[] {
  customers = filterByAnalyticsPeriod(customers);
  const byChannel = new Map<
    string,
    { applications: number; closings: number; revenue: number }
  >();

  const hasAttribution = attributionMap && Object.keys(attributionMap).length > 0;

  for (const c of customers) {
    // 帰属データがある場合は marketing_channel、ない場合は utm_source
    const channel = hasAttribution
      ? (attributionMap[c.id]?.marketing_channel || "不明")
      : (c.utm_source || "その他");

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
// チャネル×月ピボット集計（Excel PL クロス分析再現）
// ================================================================

export function computeChannelFunnelPivot(
  customers: CustomerWithRelations[],
  attributionMap?: Record<string, ChannelAttribution>
): ChannelFunnelPivot[] {
  customers = filterByAnalyticsPeriod(customers);
  const hasAttribution = attributionMap && Object.keys(attributionMap).length > 0;

  // チャネル → { periods: { period → counts }, total counts }
  const byChannel = new Map<
    string,
    {
      periods: Map<string, { applications: number; scheduled: number; conducted: number; closed: number; revenue: number }>;
      applications: number;
      scheduled: number;
      conducted: number;
      closed: number;
      revenue: number;
    }
  >();

  for (const c of customers) {
    const date = c.application_date;
    if (!date) continue;
    const period = date.slice(0, 7).replace("-", "/");

    const channel = hasAttribution
      ? (attributionMap[c.id]?.marketing_channel || "不明")
      : (c.utm_source || "その他");

    if (!byChannel.has(channel)) {
      byChannel.set(channel, {
        periods: new Map(),
        applications: 0,
        scheduled: 0,
        conducted: 0,
        closed: 0,
        revenue: 0,
      });
    }
    const ch = byChannel.get(channel)!;

    if (!ch.periods.has(period)) {
      ch.periods.set(period, { applications: 0, scheduled: 0, conducted: 0, closed: 0, revenue: 0 });
    }
    const p = ch.periods.get(period)!;

    // 申込
    p.applications++;
    ch.applications++;

    if (c.pipeline) {
      const s = c.pipeline.stage;
      const dealStatus = c.pipeline.deal_status;

      // 日程確定
      if (s !== "日程未確") {
        p.scheduled++;
        ch.scheduled++;
      }
      // 面談実施
      if (dealStatus === "実施" || isStageClosed(s)) {
        p.conducted++;
        ch.conducted++;
      }
      // 成約
      if (isStageClosed(s)) {
        const rev = c.contract?.confirmed_amount || 0;
        p.closed++;
        ch.closed++;
        p.revenue += rev;
        ch.revenue += rev;
      }
    }
  }

  return Array.from(byChannel.entries())
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .map(([channel, ch]) => {
      const periods: Record<string, { applications: number; scheduled: number; conducted: number; closed: number; revenue: number }> = {};
      ch.periods.forEach((counts, period) => {
        periods[period] = counts;
      });

      const ltvPerApp = ch.applications > 0 ? Math.round(ch.revenue / ch.applications) : 0;

      return {
        channel,
        periods,
        total: {
          applications: ch.applications,
          scheduled: ch.scheduled,
          conducted: ch.conducted,
          closed: ch.closed,
          revenue: ch.revenue,
          conduct_rate: ch.scheduled > 0 ? ch.conducted / ch.scheduled : 0,
          closing_rate: ch.conducted > 0 ? ch.closed / ch.conducted : 0,
          ltv_per_app: ltvPerApp,
          target_cpa: Math.round(ltvPerApp * 0.3),
        },
      };
    });
}

// ================================================================
// PL Sheet 再現集計（Excel準拠 — 既卒/新卒セグメント別）
// ================================================================

function isPaidChannelName(ch: string): boolean {
  return ch.includes("広告");
}

function computeSegmentData(
  customers: CustomerWithRelations[],
  attributionMap: Record<string, ChannelAttribution>,
  hasAttribution: boolean,
  allPeriods: string[]
): PLSegmentData {
  // チャネル別データ蓄積
  const channelMap = new Map<
    string,
    {
      isPaid: boolean;
      funnel: Map<string, PLFunnelCounts>;
      totals: PLFunnelCounts;
    }
  >();

  // 月別トータル
  const periodTotals = new Map<string, PLFunnelCounts>();
  const grandTotals: PLFunnelCounts = { applications: 0, scheduled: 0, conducted: 0, closed: 0 };

  // 売上
  const confirmedRevenue: Record<string, number> = {};
  const revenue: Record<string, number> = {};
  const forecastRevenue: Record<string, number> = {};
  let confirmedRevenueTotal = 0;
  let revenueTotal = 0;
  let forecastRevenueTotal = 0;

  // LTV計算用
  const closedCountByPeriod: Record<string, number> = {};
  const schoolRevByPeriod: Record<string, number> = {};
  const agentRevByPeriod: Record<string, number> = {};

  let agentConfirmed = 0;
  let agentProjected = 0;
  const agentConfirmedByPeriod: Record<string, number> = {};
  const agentProjectedByPeriod: Record<string, number> = {};

  // チャネル別売上
  const channelRevenue = new Map<string, number>();

  // Tier 3 予測用
  const forecastByPeriod: Record<string, number> = {};

  // 卒年別申込数（新卒用）
  const gradYearApps: Record<string, Record<string, number>> = {};

  for (const c of customers) {
    if (!c.application_date) continue;
    const period = c.application_date.slice(0, 7).replace("-", "/");

    // チャネル解決
    const channel = hasAttribution
      ? (attributionMap[c.id]?.marketing_channel || "不明")
      : (c.utm_source || "その他");

    const isPaid = isPaidChannelName(channel);

    // チャネルエントリ確保
    if (!channelMap.has(channel)) {
      channelMap.set(channel, {
        isPaid,
        funnel: new Map(),
        totals: { applications: 0, scheduled: 0, conducted: 0, closed: 0 },
      });
    }
    const ch = channelMap.get(channel)!;

    if (!ch.funnel.has(period)) {
      ch.funnel.set(period, { applications: 0, scheduled: 0, conducted: 0, closed: 0 });
    }
    const pf = ch.funnel.get(period)!;

    if (!periodTotals.has(period)) {
      periodTotals.set(period, { applications: 0, scheduled: 0, conducted: 0, closed: 0 });
    }
    const pt = periodTotals.get(period)!;

    // 申込
    pf.applications++;
    ch.totals.applications++;
    pt.applications++;
    grandTotals.applications++;

    // ファネルステップ
    if (c.pipeline) {
      const s = c.pipeline.stage;
      const dealStatus = c.pipeline.deal_status;

      // 日程確定
      if (s !== "日程未確") {
        pf.scheduled++;
        ch.totals.scheduled++;
        pt.scheduled++;
        grandTotals.scheduled++;
      }
      // 面談実施
      if (dealStatus === "実施" || isStageClosed(s)) {
        pf.conducted++;
        ch.totals.conducted++;
        pt.conducted++;
        grandTotals.conducted++;
      }
      // 成約
      if (isStageClosed(s)) {
        pf.closed++;
        ch.totals.closed++;
        pt.closed++;
        grandTotals.closed++;

        const amount = c.contract?.confirmed_amount || 0;
        confirmedRevenue[period] = (confirmedRevenue[period] || 0) + amount;
        confirmedRevenueTotal += amount;
        closedCountByPeriod[period] = (closedCountByPeriod[period] || 0) + 1;
        schoolRevByPeriod[period] = (schoolRevByPeriod[period] || 0) + amount;
      }
    }

    // 人材紹介売上
    if (isAgentCustomer(c)) {
      const fee = calcExpectedReferralFee(c);
      if (isAgentConfirmed(c)) {
        agentConfirmed += fee;
        agentConfirmedByPeriod[period] = (agentConfirmedByPeriod[period] || 0) + fee;
        agentRevByPeriod[period] = (agentRevByPeriod[period] || 0) + fee;
      } else if (isCurrentlyEnrolled(c)) {
        agentProjected += fee;
        agentProjectedByPeriod[period] = (agentProjectedByPeriod[period] || 0) + fee;
        agentRevByPeriod[period] = (agentRevByPeriod[period] || 0) + fee;
      }
    }

    // チャネル別売上（成約のみ）
    if (isStageClosed(c.pipeline?.stage)) {
      const chRev = channelRevenue.get(channel) || 0;
      channelRevenue.set(channel, chRev + (c.contract?.confirmed_amount || 0));
    }

    // Tier 3: 未成約パイプラインの期待値
    if (!isStageClosed(c.pipeline?.stage)) {
      const prob = calcClosingProbability(c);
      if (prob > 0) {
        const potentialSchool = (c.contract?.confirmed_amount || 0) > 0
          ? c.contract!.confirmed_amount!
          : (isShinsotsu(c.attribute) ? 240000 : 427636);
        const potentialAgent = isAgentCustomer(c) ? calcExpectedReferralFee(c) * prob : 0;
        const potentialSubsidy = getSubsidyAmount(c) * prob;
        forecastByPeriod[period] = (forecastByPeriod[period] || 0) +
          potentialSchool * prob + potentialAgent + potentialSubsidy;
      }
    }

    // 卒年別申込数
    if (c.graduation_year) {
      const gy = String(c.graduation_year);
      if (!gradYearApps[gy]) gradYearApps[gy] = {};
      gradYearApps[gy][period] = (gradYearApps[gy][period] || 0) + 1;
    }
  }

  // 売上計算: revenue = confirmed + agent, forecast = confirmed + agent + pipeline期待値
  for (const p of allPeriods) {
    const conf = confirmedRevenue[p] || 0;
    const agentRev = agentRevByPeriod[p] || 0;
    revenue[p] = conf + agentRev;
    revenueTotal += revenue[p];
    const forecast = conf + agentRev + (forecastByPeriod[p] || 0);
    forecastRevenue[p] = Math.round(forecast);
    forecastRevenueTotal += forecastRevenue[p];
  }

  // LTV計算
  const ltvSchool: Record<string, number> = {};
  const ltvWithAgent: Record<string, number> = {};
  let totalClosedCount = 0;
  let totalSchoolRev = 0;
  let totalAgentRev = 0;

  for (const p of allPeriods) {
    const closed = closedCountByPeriod[p] || 0;
    const schoolRev = schoolRevByPeriod[p] || 0;
    const agentRev = agentRevByPeriod[p] || 0;

    ltvSchool[p] = closed > 0 ? Math.round(schoolRev / closed) : 0;
    ltvWithAgent[p] = closed > 0 ? Math.round((schoolRev + agentRev) / closed) : 0;

    totalClosedCount += closed;
    totalSchoolRev += schoolRev;
    totalAgentRev += agentRev;
  }

  const cumulativeLtvSchool = totalClosedCount > 0 ? Math.round(totalSchoolRev / totalClosedCount) : 0;
  const cumulativeLtvWithAgent = totalClosedCount > 0 ? Math.round((totalSchoolRev + totalAgentRev) / totalClosedCount) : 0;

  const ltvPerApp = grandTotals.applications > 0 ? Math.round(confirmedRevenueTotal / grandTotals.applications) : 0;
  const targetCpa = Math.round(ltvPerApp * 0.3);

  // チャネルデータ変換
  const channels: PLChannelData[] = [];
  channelMap.forEach((data, name) => {
    const funnel: Record<string, PLFunnelCounts> = {};
    data.funnel.forEach((counts, period) => {
      funnel[period] = counts;
    });
    channels.push({
      name,
      isPaid: data.isPaid,
      funnel,
      totals: data.totals,
      revenue: channelRevenue.get(name) || 0,
    });
  });

  // ソート: organic → paid、それぞれ申込数降順
  channels.sort((a, b) => {
    if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
    return b.totals.applications - a.totals.applications;
  });

  // periodTotals変換
  const totals: Record<string, PLFunnelCounts> = {};
  periodTotals.forEach((counts, period) => {
    totals[period] = counts;
  });

  return {
    revenue,
    confirmedRevenue,
    forecastRevenue,
    revenueTotal,
    confirmedRevenueTotal,
    forecastRevenueTotal,
    channels,
    totals,
    grandTotals,
    ltvSchool,
    ltvWithAgent,
    cumulativeLtvSchool,
    cumulativeLtvWithAgent,
    agentConfirmedByPeriod,
    agentProjectedByPeriod,
    agentConfirmed,
    agentProjected,
    ltvPerApp,
    targetCpa,
    graduationYearApps: Object.keys(gradYearApps).length > 0 ? gradYearApps : undefined,
  };
}

export function computePLSheetData(
  customers: CustomerWithRelations[],
  attributionMap: Record<string, ChannelAttribution>
): PLSheetData {
  customers = filterByAnalyticsPeriod(customers);
  const hasAttribution = Object.keys(attributionMap).length > 0;

  // 全期間収集
  const periodSet = new Set<string>();
  for (const c of customers) {
    if (c.application_date) {
      periodSet.add(c.application_date.slice(0, 7).replace("-", "/"));
    }
  }
  const periods = Array.from(periodSet).sort();

  // 既卒/新卒分割
  const kisotsuCustomers = customers.filter(c => !isShinsotsu(c.attribute));
  const shinsotsuCustomers = customers.filter(c => isShinsotsu(c.attribute));

  return {
    periods,
    kisotsu: computeSegmentData(kisotsuCustomers, attributionMap, hasAttribution, periods),
    shinsotsu: computeSegmentData(shinsotsuCustomers, attributionMap, hasAttribution, periods),
  };
}

// ================================================================
// ダッシュボード直接集計（既存）
// ================================================================

async function fetchDashboardDataRaw() {
  const supabase = createServiceClient();

  const { count: totalCustomers } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .gte("application_date", ANALYTICS_START_DATE);

  const { data: pipelineData } = await supabase
    .from("sales_pipeline")
    .select("stage, customers!inner(application_date)")
    .gte("customers.application_date", ANALYTICS_START_DATE) as { data: { stage: string }[] | null };

  const stageCounts: Record<string, number> = {};
  for (const p of pipelineData || []) {
    stageCounts[p.stage] = (stageCounts[p.stage] || 0) + 1;
  }

  const closedStages = ["成約", "入金済"];
  let closedCount = 0;
  for (const s of closedStages) {
    closedCount += stageCounts[s] || 0;
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
