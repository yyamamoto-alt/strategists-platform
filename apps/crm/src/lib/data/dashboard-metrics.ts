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
  calcExpectedLTV,
  isAgentCustomer,
  isCurrentlyEnrolled,
  isAgentConfirmed,
  type RecentClosingRates,
  getSubsidyAmount,
  getSchoolRevenue,
  calcAgentProjectedRevenue,
  isShinsotsu,
  DEFAULT_LTV_CONFIG,
  type LtvConfig,
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

/** 成約判定: 「成約」「入金済」「途中解約(成約)」。動画講座購入/その他購入/追加指導/成約見込は除外 */
function isStageClosed(stage: string | undefined | null): boolean {
  if (!stage) return false;
  return stage === "成約" || stage === "入金済" || stage === "途中解約(成約)";
}

/** 期間文字列を取得（Excel PL準拠: 申込月ベース） */
function getPeriod(c: CustomerWithRelations): string | null {
  const date = c.application_date || c.pipeline?.sales_date;
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

/** 追加指導ステージ判定 */
function isAdditionalCoaching(stage: string | undefined | null): boolean {
  if (!stage) return false;
  return stage.startsWith("追加指導");
}

/** 面談実施済み判定: 面談が実際に行われたステージのみ */
const NOT_CONDUCTED_STAGES = new Set([
  "日程未確", "未実施", "実施不可",
  "キャンセル", "直前キャンセル", "NoShow",
]);
function isConducted(stage: string | undefined | null): boolean {
  if (!stage) return false;
  return !NOT_CONDUCTED_STAGES.has(stage);
}

/** 失注（結果確定: ネガティブ）判定 */
const LOST_STAGES = new Set([
  "失注", "失注見込", "失注見込(自動)", "CL", "全額返金",
]);
function isStageLost(stage: string | undefined | null): boolean {
  if (!stage) return false;
  return LOST_STAGES.has(stage);
}

export function computeFunnelMetrics(
  customers: CustomerWithRelations[]
): FunnelMetrics[] {
  const filtered = filterByAnalyticsPeriod(customers);
  const today = new Date().toISOString().slice(0, 10);
  const byMonth = new Map<
    string,
    { applications: number; scheduled: number; pending_future: number; conducted: number; closed: number; lost: number; additional_coaching: number }
  >();

  for (const c of filtered) {
    const date = c.application_date;
    if (!date) continue;
    const period = date.slice(0, 7).replace("-", "/");

    if (!byMonth.has(period)) {
      byMonth.set(period, { applications: 0, scheduled: 0, pending_future: 0, conducted: 0, closed: 0, lost: 0, additional_coaching: 0 });
    }
    const m = byMonth.get(period)!;
    m.applications++;

    if (c.pipeline) {
      const s = c.pipeline.stage;
      // 日程確定以降（日程未確以外すべて）
      if (s !== "日程未確") {
        m.scheduled++;
      }
      // 未実施かつ営業予定日が未来 → 参考値（pending_future）
      if (s === "未実施") {
        const meetingDate = c.pipeline.meeting_scheduled_date;
        if (meetingDate && meetingDate > today) {
          m.pending_future++;
        }
      }
      // 面談実施: stageが NOT_CONDUCTED_STAGES 以外
      if (isConducted(s)) {
        m.conducted++;
      }
      // 追加指導（参考値）
      if (isAdditionalCoaching(s)) {
        m.additional_coaching++;
      }
      // 成約判定
      if (isStageClosed(s)) {
        m.closed++;
      }
      // 失注判定（成約率の分母に使用）
      if (isStageLost(s)) {
        m.lost++;
      }
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, m]) => {
      // 実施率 = 実施数 / 日程確定数
      // 成約率 = 成約数 / (成約数 + 失注数) — 結果確定者のみで計算
      const closingDenom = m.closed + m.lost;
      return {
        period,
        ...m,
        scheduling_rate: m.applications > 0 ? m.scheduled / m.applications : 0,
        conduct_rate: m.scheduled > 0 ? m.conducted / m.scheduled : 0,
        closing_rate: closingDenom > 0 ? m.closed / closingDenom : 0,
      };
    });
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
    const amount = getSchoolRevenue(c);
    const hasPaid = amount > 0;

    const closed = isStageClosed(c.pipeline?.stage);

    // 確定売上: 支払い実績ベース（ステージ不問）
    if (hasPaid) {
      m.confirmed_revenue += amount;
      m.school_revenue += amount;
    }

    // 人材見込み: 人材紹介顧客のみ
    const agentFee = isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0;
    const subsidy = closed ? getSubsidyAmount(c) : 0;
    m.projected_revenue += (hasPaid ? amount : 0) + agentFee + subsidy;

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

/** 直近N月のファネル成約率を計算（実施-追加指導→成約ベース） */
function computeRecentClosingRate(
  customers: CustomerWithRelations[],
  recentMonths: number = 3
): number {
  const rates = computeRecentClosingRateByAttribute(customers, recentMonths);
  // 全体平均: 既卒と新卒の加重平均的な値
  const allConducted = rates._totalConducted;
  const allClosed = rates._totalClosed;
  return allConducted > 0 ? allClosed / allConducted : 0;
}

/** 直近N月の既卒/新卒別成約率を計算 */
function computeRecentClosingRateByAttribute(
  customers: CustomerWithRelations[],
  recentMonths: number = 3
): RecentClosingRates & { _totalConducted: number; _totalClosed: number } {
  const byMonth = new Map<string, {
    kisotsu_conducted: number; kisotsu_closed: number; kisotsu_ac: number;
    shinsotsu_conducted: number; shinsotsu_closed: number; shinsotsu_ac: number;
  }>();

  for (const c of customers) {
    const date = c.application_date;
    if (!date) continue;
    const period = date.slice(0, 7).replace("-", "/");
    if (!byMonth.has(period)) {
      byMonth.set(period, {
        kisotsu_conducted: 0, kisotsu_closed: 0, kisotsu_ac: 0,
        shinsotsu_conducted: 0, shinsotsu_closed: 0, shinsotsu_ac: 0,
      });
    }
    const m = byMonth.get(period)!;
    if (!c.pipeline) continue;
    const s = c.pipeline.stage;
    const shin = isShinsotsu(c.attribute);

    if (isConducted(s)) {
      if (shin) m.shinsotsu_conducted++; else m.kisotsu_conducted++;
    }
    if (isAdditionalCoaching(s)) {
      if (shin) m.shinsotsu_ac++; else m.kisotsu_ac++;
    }
    if (isStageClosed(s)) {
      if (shin) m.shinsotsu_closed++; else m.kisotsu_closed++;
    }
  }

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const sortedPeriods = Array.from(byMonth.keys())
    .filter((p) => p < currentPeriod)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, recentMonths);

  let kConducted = 0, kClosed = 0, kAC = 0;
  let sConducted = 0, sClosed = 0, sAC = 0;
  for (const p of sortedPeriods) {
    const m = byMonth.get(p)!;
    kConducted += m.kisotsu_conducted; kClosed += m.kisotsu_closed; kAC += m.kisotsu_ac;
    sConducted += m.shinsotsu_conducted; sClosed += m.shinsotsu_closed; sAC += m.shinsotsu_ac;
  }

  // 直近データが不足する場合は全期間にフォールバック
  if ((kConducted - kAC) <= 0 && (sConducted - sAC) <= 0) {
    for (const m of Array.from(byMonth.values())) {
      kConducted += m.kisotsu_conducted; kClosed += m.kisotsu_closed; kAC += m.kisotsu_ac;
      sConducted += m.shinsotsu_conducted; sClosed += m.shinsotsu_closed; sAC += m.shinsotsu_ac;
    }
  }

  const kDenom = kConducted - kAC;
  const sDenom = sConducted - sAC;
  const kisotsuRate = kDenom > 0 ? kClosed / kDenom : 0.30; // フォールバック30%
  const shinsotsuRate = sDenom > 0 ? sClosed / sDenom : 0.15; // フォールバック15%

  return {
    kisotsu: kisotsuRate,
    shinsotsu: shinsotsuRate,
    _totalConducted: (kConducted - kAC) + (sConducted - sAC),
    _totalClosed: kClosed + sClosed,
  };
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

  // 直近3ヶ月の既卒/新卒別成約率を算出（未実施/日程未確のLTV計算に使用）
  const recentRates = computeRecentClosingRateByAttribute(customers, 3);
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
      // MAXライン: 見込みLTV合計
      expected_ltv: number;
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
        expected_ltv: 0,
      });
    }
    const m = byMonth.get(period)!;
    const amount = getSchoolRevenue(c);
    const closed = isStageClosed(c.pipeline?.stage);
    const hasPaid = amount > 0; // 支払い実績があれば確定売上（ステージ不問）

    // MAXライン: 全顧客の見込みLTV合計（成約済みも未成約も含む）
    m.expected_ltv += calcExpectedLTV(c, undefined, recentRates);

    // --- Tier 1: 確定売上（支払い実績ベース — ステージ不問） ---
    if (hasPaid) {
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

    // 補助金（成約ステージのみ — 補助金は申請が必要なため成約判定を維持）
    if (closed) {
      m.confirmed_subsidy += getSubsidyAmount(c);
    }

    // --- Tier 2: 人材見込み（確定除外、受講中のみ — Excel Col BU 準拠） ---
    // isCurrentlyEnrolled: 成約/入金済/追加指導 かつ 指導終了日が未来
    // calcAgentProjectedRevenue を使用: 「一部利用」は0.5倍（calcExpectedLTVと一致させる）
    const enrolledAgent = isAgentCustomer(c) && !isAgentConfirmed(c) && isCurrentlyEnrolled(c);
    if (enrolledAgent) {
      const fee = calcAgentProjectedRevenue(c);
      if (fee > 0) {
        m.projected_agent += fee;
      }
    }

    // --- Tier 3: ステージ別成約確率ベースの予測 ---
    // 支払い済みは確定に計上済みなので、未払い顧客のみ予測
    if (!hasPaid && !closed) {
      const prob = calcClosingProbability(c, recentRates);
      if (prob > 0) {
        // スクール売上期待値
        const potentialSchool =
          (isShinsotsu(c.attribute) ? DEFAULT_LTV_CONFIG.defaultLtvShinsotsu : DEFAULT_LTV_CONFIG.defaultLtvKisotsu);
        m.forecast_school += potentialSchool * prob;
        // エージェント売上期待値（Tier 2で計上済みの受講中顧客は除外）
        if (isAgentCustomer(c) && !enrolledAgent) {
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
      expected_ltv: 0,
    });
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, m]) => {
      const confirmedTotal =
        m.confirmed_school + m.confirmed_agent + m.confirmed_subsidy;
      const projectedTotal = confirmedTotal + m.projected_agent;

      // Tier 3: 見込み含む売上 + 未成約パイプラインの期待値（ステージ別確率）
      // 月消化率補正は確定+見込みベースのみに適用（未成約パイプラインの期待値は確率補正済みのため不要）
      const monthMultiplier = getMonthProgressMultiplier(period);
      const forecastFromPipeline = m.forecast_school + m.forecast_agent + m.forecast_subsidy;
      const forecastTotal = projectedTotal * monthMultiplier + forecastFromPipeline;

      // MAXライン: 過去月はフル値、当月のみ日数按分で月末推定に拡大
      // 例: 3/9時点 → 9日分のデータしかないので 31/9 ≈ 3.4倍して月全体を推定
      const monthExtrapolation = period === currentPeriod
        ? (new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() / Math.max(1, new Date().getDate()))
        : 1;
      const expectedLtvTotal = Math.round(m.expected_ltv * monthExtrapolation);

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
        expected_ltv_total: expectedLtvTotal,
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

    const rev = getSchoolRevenue(c);
    if (rev > 0) {
      m.closings++;
      m.revenue += rev;
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

  const byChannel = new Map<
    string,
    {
      periods: Map<string, { applications: number; scheduled: number; conducted: number; closed: number; revenue: number }>;
      applications: number;
      scheduled: number;
      conducted: number;
      closed: number;
      lost: number;
      revenue: number;
      additional_coaching: number;
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
        lost: 0,
        revenue: 0,
        additional_coaching: 0,
      });
    }
    const ch = byChannel.get(channel)!;

    if (!ch.periods.has(period)) {
      ch.periods.set(period, { applications: 0, scheduled: 0, conducted: 0, closed: 0, revenue: 0 });
    }
    const p = ch.periods.get(period)!;

    p.applications++;
    ch.applications++;

    if (c.pipeline) {
      const s = c.pipeline.stage;

      if (s !== "日程未確") {
        p.scheduled++;
        ch.scheduled++;
      }
      if (isConducted(s)) {
        p.conducted++;
        ch.conducted++;
      }
      if (isAdditionalCoaching(s)) {
        ch.additional_coaching++;
      }
      if (isStageClosed(s)) {
        p.closed++;
        ch.closed++;
      }
      if (isStageLost(s)) {
        ch.lost++;
      }
    }

    // 確定売上: 支払い実績ベース（ステージ不問）
    const rev = getSchoolRevenue(c);
    if (rev > 0) {
      p.revenue += rev;
      ch.revenue += rev;
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
      // 成約率分母: 結果確定者のみ（成約 + 失注）
      const closingDenom = (ch.closed || 0) + (ch.lost || 0);

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
          closing_rate: closingDenom > 0 ? ch.closed / closingDenom : 0,
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
  const grandTotals: PLFunnelCounts = { applications: 0, scheduled: 0, conducted: 0, closed: 0, lost: 0, additional_coaching: 0 };

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

  // 確定売上に含める追加項目（ダッシュボードと整合）
  const agentConfirmedRevByPeriod: Record<string, number> = {};
  const subsidyByPeriod: Record<string, number> = {};

  // チャネル別売上（合計 + 月別）
  const channelRevenue = new Map<string, number>();
  const channelRevenueByPeriod = new Map<string, Record<string, number>>();

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
        totals: { applications: 0, scheduled: 0, conducted: 0, closed: 0, lost: 0, additional_coaching: 0 },
      });
    }
    const ch = channelMap.get(channel)!;

    if (!ch.funnel.has(period)) {
      ch.funnel.set(period, { applications: 0, scheduled: 0, conducted: 0, closed: 0, lost: 0, additional_coaching: 0 });
    }
    const pf = ch.funnel.get(period)!;

    if (!periodTotals.has(period)) {
      periodTotals.set(period, { applications: 0, scheduled: 0, conducted: 0, closed: 0, lost: 0, additional_coaching: 0 });
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

      // 日程確定
      if (s !== "日程未確") {
        pf.scheduled++;
        ch.totals.scheduled++;
        pt.scheduled++;
        grandTotals.scheduled++;
      }
      // 面談実施
      if (isConducted(s)) {
        pf.conducted++;
        ch.totals.conducted++;
        pt.conducted++;
        grandTotals.conducted++;
      }
      // 追加指導（成約率分母から除外）
      if (isAdditionalCoaching(s)) {
        pf.additional_coaching++;
        ch.totals.additional_coaching++;
        pt.additional_coaching++;
        grandTotals.additional_coaching++;
      }
      // 成約
      // ファネル成約カウント（ステージベース — 成約率計算用）
      if (isStageClosed(s)) {
        pf.closed++;
        ch.totals.closed++;
        pt.closed++;
        grandTotals.closed++;
      }
      // 失注（成約率分母に使用）
      if (isStageLost(s)) {
        pf.lost++;
        ch.totals.lost++;
        pt.lost++;
        grandTotals.lost++;
      }
    }

    // --- 確定売上: 支払い実績ベース（ステージ不問） ---
    const amount = getSchoolRevenue(c);
    const hasPaid = amount > 0;

    if (hasPaid) {
      closedCountByPeriod[period] = (closedCountByPeriod[period] || 0) + 1;
      // schoolRevByPeriod: スクール確定（補助金込み） — P/Lの「スクール確定分」に対応
      const subsidy = getSubsidyAmount(c);
      schoolRevByPeriod[period] = (schoolRevByPeriod[period] || 0) + amount + subsidy;

      // 確定売上 = スクール確定(補助金込み) + 人材確定
      let periodConfirmed = amount + subsidy;
      // 補助金を別途トラッキング
      if (subsidy > 0) {
        subsidyByPeriod[period] = (subsidyByPeriod[period] || 0) + subsidy;
      }
      // 人材確定分
      if (isAgentCustomer(c) && isAgentConfirmed(c)) {
        const agentFee = calcExpectedReferralFee(c);
        periodConfirmed += agentFee;
        agentConfirmedRevByPeriod[period] = (agentConfirmedRevByPeriod[period] || 0) + agentFee;
      }
      confirmedRevenue[period] = (confirmedRevenue[period] || 0) + periodConfirmed;
      confirmedRevenueTotal += periodConfirmed;
    }

    // 人材紹介売上（見込み用: 確定は confirmedRevenue に計上済み）
    if (isAgentCustomer(c)) {
      const fee = calcExpectedReferralFee(c);
      if (isAgentConfirmed(c)) {
        agentConfirmed += fee;
        agentConfirmedByPeriod[period] = (agentConfirmedByPeriod[period] || 0) + fee;
      } else if (isCurrentlyEnrolled(c)) {
        agentProjected += fee;
        agentProjectedByPeriod[period] = (agentProjectedByPeriod[period] || 0) + fee;
        agentRevByPeriod[period] = (agentRevByPeriod[period] || 0) + fee;
      }
    }

    // チャネル別売上（支払い実績ベース）
    if (hasPaid) {
      channelRevenue.set(channel, (channelRevenue.get(channel) || 0) + amount);
      if (!channelRevenueByPeriod.has(channel)) channelRevenueByPeriod.set(channel, {});
      const crp = channelRevenueByPeriod.get(channel)!;
      crp[period] = (crp[period] || 0) + amount;
    }

    // Tier 3: 未払い顧客のパイプライン期待値
    if (!hasPaid && !isStageClosed(c.pipeline?.stage)) {
      const prob = calcClosingProbability(c);
      if (prob > 0) {
        const potentialSchool = isShinsotsu(c.attribute) ? 240000 : 427636;
        const isEnrolledAgent = isAgentCustomer(c) && !isAgentConfirmed(c) && isCurrentlyEnrolled(c);
        const potentialAgent = (isAgentCustomer(c) && !isEnrolledAgent) ? calcExpectedReferralFee(c) * prob : 0;
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

  // 売上計算: revenue = confirmed + agent, forecast = confirmed + agent + pipeline期待値 × 月消化率補正
  for (const p of allPeriods) {
    const conf = confirmedRevenue[p] || 0;
    const agentRev = agentRevByPeriod[p] || 0;
    revenue[p] = conf + agentRev;
    revenueTotal += revenue[p];
    const forecast = conf + agentRev + (forecastByPeriod[p] || 0);
    const monthMul = getMonthProgressMultiplier(p);
    forecastRevenue[p] = Math.round(forecast * monthMul);
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
      revenueByPeriod: channelRevenueByPeriod.get(name) || {},
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
// チャネル別トレンド分析（直近2週間 vs 前6週間）
// ================================================================

export interface ChannelTrend {
  channel: string;
  recentCount: number;          // 直近1ヶ月の申込数
  baselineCount: number;        // 前2ヶ月の申込数
  baselineMonthlyRate: number;  // 前2ヶ月の月あたり申込数
  trendPct: number;             // 変化率 (%)
  trend: "up" | "down" | "stable";
}

export function computeChannelTrends(
  customers: CustomerWithRelations[],
  attributionMap?: Record<string, ChannelAttribution>
): ChannelTrend[] {
  const now = new Date();
  const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

  const oneMonthStr = oneMonthAgo.toISOString().slice(0, 10);
  const threeMonthsStr = threeMonthsAgo.toISOString().slice(0, 10);

  const hasAttribution = attributionMap && Object.keys(attributionMap).length > 0;

  const byChannel = new Map<string, { recent: number; baseline: number }>();

  for (const c of customers) {
    const date = c.application_date;
    if (!date) continue;
    if (date < threeMonthsStr) continue;

    const channel = hasAttribution
      ? (attributionMap[c.id]?.marketing_channel || "不明")
      : (c.utm_source || "その他");

    if (!byChannel.has(channel)) {
      byChannel.set(channel, { recent: 0, baseline: 0 });
    }
    const m = byChannel.get(channel)!;

    if (date >= oneMonthStr) {
      m.recent++;
    } else {
      m.baseline++;
    }
  }

  return Array.from(byChannel.entries())
    .map(([channel, m]) => {
      const baselineMonthlyRate = m.baseline / 2;

      let trendPct = 0;
      let trend: "up" | "down" | "stable" = "stable";

      if (baselineMonthlyRate > 0) {
        trendPct = ((m.recent - baselineMonthlyRate) / baselineMonthlyRate) * 100;
        trend = trendPct > 15 ? "up" : trendPct < -15 ? "down" : "stable";
      } else if (m.recent > 0) {
        trendPct = 100;
        trend = "up";
      }

      return {
        channel,
        recentCount: m.recent,
        baselineCount: m.baseline,
        baselineMonthlyRate: Math.round(baselineMonthlyRate * 10) / 10,
        trendPct: Math.round(trendPct),
        trend,
      };
    })
    .filter(t => t.recentCount > 0 || t.baselineCount > 0)
    .sort((a, b) => b.recentCount - a.recentCount);
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

// ================================================================
// Order-based Revenue（orders テーブルベース売上計算 — 移行期間は並行稼働）
// ================================================================

export interface OrderBasedRevenue {
  period: string; // "YYYY/MM"
  total_amount: number;
  total_excl_tax: number;
  order_count: number;
  by_type: Record<string, { amount: number; count: number }>;
  by_source: Record<string, { amount: number; count: number }>;
}

/**
 * orders テーブルから月別売上を計算（段階的切替用）
 * 既存の computeRevenueMetrics() と並行して比較するために使用
 */
export async function computeOrderBasedRevenue(): Promise<OrderBasedRevenue[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: orders, error } = await db
    .from("orders")
    .select("amount, amount_excl_tax, paid_at, order_type, source, status")
    .in("status", ["paid", "partial"]);

  if (error || !orders) {
    console.error("Failed to fetch orders for revenue:", error);
    return [];
  }

  const periodMap = new Map<string, OrderBasedRevenue>();

  for (const o of orders) {
    if (!o.paid_at) continue;
    const d = new Date(o.paid_at);
    const period = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;

    if (!periodMap.has(period)) {
      periodMap.set(period, {
        period,
        total_amount: 0,
        total_excl_tax: 0,
        order_count: 0,
        by_type: {},
        by_source: {},
      });
    }

    const entry = periodMap.get(period)!;
    entry.total_amount += o.amount || 0;
    entry.total_excl_tax += o.amount_excl_tax || o.amount || 0;
    entry.order_count++;

    // by_type
    const typeKey = o.order_type || "other";
    if (!entry.by_type[typeKey]) entry.by_type[typeKey] = { amount: 0, count: 0 };
    entry.by_type[typeKey].amount += o.amount || 0;
    entry.by_type[typeKey].count++;

    // by_source
    const srcKey = o.source || "unknown";
    if (!entry.by_source[srcKey]) entry.by_source[srcKey] = { amount: 0, count: 0 };
    entry.by_source[srcKey].amount += o.amount || 0;
    entry.by_source[srcKey].count++;
  }

  const results = Array.from(periodMap.values());
  results.sort((a, b) => a.period.localeCompare(b.period));
  return results;
}
