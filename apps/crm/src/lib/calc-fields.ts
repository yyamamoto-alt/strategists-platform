import type { CustomerWithRelations } from "@strategy-school/shared-db";

// ================================================================
// 共通ヘルパー（dashboard-metrics.ts と共用、client-safe）
// ================================================================

/** 顧客のエージェント紹介報酬期待値を算出（Excel Col DX 再現） */
export function calcExpectedReferralFee(c: CustomerWithRelations): number {
  const a = c.agent;
  if (!a) return 0;
  if (a.expected_referral_fee && a.expected_referral_fee > 0) {
    return a.expected_referral_fee;
  }
  const salary = a.offer_salary || 0;
  const hireRate = a.hire_rate ?? 0.6;
  const offerProb = a.offer_probability ?? 0.3;
  const feeRate = a.referral_fee_rate ?? 0.3;
  const margin = a.margin ?? 1.0;
  return salary * hireRate * offerProb * feeRate * margin;
}

/** 顧客がエージェント利用者か判定 */
export function isAgentCustomer(c: CustomerWithRelations): boolean {
  if (!c.agent) return false;
  if (c.agent.agent_service_enrolled) return true;
  if (c.agent.expected_referral_fee && c.agent.expected_referral_fee > 0) return true;
  if (c.agent.offer_salary && c.agent.offer_salary > 0) return true;
  return false;
}

/** 顧客が「受講中」か判定（Excel Col BU の条件） */
export function isCurrentlyEnrolled(c: CustomerWithRelations): boolean {
  const stage = c.pipeline?.stage;
  if (stage !== "成約" && stage !== "入金済") return false;
  if (!c.learning) return false;
  if (!c.learning.coaching_end_date) return true;
  const endDate = new Date(c.learning.coaching_end_date);
  if (isNaN(endDate.getTime())) return false;
  return endDate >= new Date();
}

/** 顧客のエージェント確定フラグを判定 */
export function isAgentConfirmed(c: CustomerWithRelations): boolean {
  return c.agent?.placement_confirmed === "確定";
}

/** 補助金額算出（Excel Col EJ: リスキャリ補助金） */
export function getSubsidyAmount(c: CustomerWithRelations): number {
  if (c.contract?.referral_category === "対象" || c.contract?.subsidy_eligible) {
    return c.contract?.subsidy_amount || 203636;
  }
  return 0;
}

// ================================================================
// Phase 3: 算出フィールド（Excel パリティ用）
// ================================================================

/** 成約見込率（Excel Col DB: IFS formula with stage conditions） */
export function calcClosingProbability(c: CustomerWithRelations): number {
  const stage = c.pipeline?.stage;
  if (!stage) return 0;
  if (stage === "入金済" || stage === "成約") return 1.0;
  if (stage === "失注") return 0;
  if (stage === "保留" || c.pipeline?.deal_status === "保留") return 0;
  if (stage === "提案中") return 0.5;
  if (stage === "面談実施") return 0.3;
  if (stage === "日程確定") return 0.15;
  if (stage === "問い合わせ") return 0.05;
  return 0;
}

/** 見込LTV（Excel Col DD） */
export function calcExpectedLTV(c: CustomerWithRelations): number {
  const confirmedAmount = c.contract?.confirmed_amount || 0;
  if (confirmedAmount > 0) {
    const agentFee = isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0;
    const subsidy = getSubsidyAmount(c);
    return confirmedAmount + agentFee + subsidy;
  }
  const defaultLTV = c.attribute === "新卒" ? 240000 : 427636;
  return Math.round(defaultLTV * calcClosingProbability(c));
}

/** 残指導回数 */
export function calcRemainingSessions(c: CustomerWithRelations): number {
  if (!c.learning) return 0;
  return Math.max(0, (c.learning.total_sessions || 0) - (c.learning.completed_sessions || 0));
}

/** 日程消化率（スケジュール進捗） */
export function calcScheduleProgress(c: CustomerWithRelations): number | null {
  if (!c.learning?.coaching_start_date || !c.learning?.coaching_end_date) return null;
  const startDate = new Date(c.learning.coaching_start_date);
  const endDate = new Date(c.learning.coaching_end_date);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
  const start = startDate.getTime();
  const end = endDate.getTime();
  if (end <= start) return null;
  return Math.max(0, Math.min(1, (Date.now() - start) / (end - start)));
}

/** 指導消化率 */
export function calcSessionProgress(c: CustomerWithRelations): number | null {
  if (!c.learning) return null;
  const total = c.learning.total_sessions;
  if (!total || total <= 0) return null;
  const completed = c.learning.completed_sessions || 0;
  return Math.min(1.0, completed / total);
}

/** 進捗ステータス */
export function calcProgressStatus(c: CustomerWithRelations): "順調" | "遅延" | "-" {
  const schedule = calcScheduleProgress(c);
  const session = calcSessionProgress(c);
  if (schedule === null || session === null || session === 0) return "-";
  return schedule / session > 1.5 ? "遅延" : "順調";
}

/** 人材見込売上（プランタイプ乗数付き）（Excel Col BU） */
export function calcAgentProjectedRevenue(c: CustomerWithRelations): number {
  if (!isCurrentlyEnrolled(c) || !isAgentCustomer(c) || isAgentConfirmed(c)) return 0;
  const fee = calcExpectedReferralFee(c);
  const plan = c.contract?.plan_name || "";
  let multiplier = 1.0;
  if (plan.includes("専用")) multiplier = 1.0;
  else if (plan.includes("併用")) multiplier = 0.5;
  else if (c.contract?.referral_category === "対象") multiplier = 0.42;
  return Math.round(fee * multiplier);
}
