import type { CustomerWithRelations } from "@strategy-school/shared-db";

// ================================================================
// 共通ヘルパー（dashboard-metrics.ts と共用、client-safe）
// ================================================================

/** 新卒判定: "新卒", "27卒(学部卒)", "28卒(院卒)" 等すべてを新卒と判定 */
export function isShinsotsu(attribute: string | null | undefined): boolean {
  if (!attribute) return false;
  if (attribute.includes("既卒")) return false;
  return attribute.includes("卒");
}

/** 内定ランク → 通過率マッピング */
const OFFER_RANK_RATE: Record<string, number> = {
  S: 0.60,
  A: 0.40,
  B: 0.20,
  C: 0.10,
  D: 0.00,
};

export const OFFER_RANK_META: Record<string, { label: string; color: string; bgColor: string }> = {
  S: { label: "内定確実", color: "text-yellow-400", bgColor: "bg-yellow-400/10" },
  A: { label: "内定十分可能", color: "text-gray-300", bgColor: "bg-gray-300/10" },
  B: { label: "内定可能性あり", color: "text-amber-600", bgColor: "bg-amber-600/10" },
  C: { label: "内定厳しい", color: "text-gray-500", bgColor: "bg-gray-500/10" },
  D: { label: "内定不可能", color: "text-gray-700", bgColor: "bg-gray-700/10" },
};

/** 内定ランクから通過率を取得 */
export function getOfferRankRate(rank: string | null | undefined): number {
  if (!rank) return OFFER_RANK_RATE.B; // デフォルトBランク
  return OFFER_RANK_RATE[rank] ?? OFFER_RANK_RATE.B;
}

/** 顧客のエージェント紹介報酬期待値を算出
 *  確定済み: DB上のexpected_referral_fee（ベタ打ち確定額）を優先
 *  未確定: 想定年収 × 内定ランク通過率 × 紹介料率 × マージン で計算
 */
export function calcExpectedReferralFee(c: CustomerWithRelations): number {
  const a = c.agent;
  if (!a) return 0;

  // 確定済みの場合: DBのexpected_referral_feeを優先（Excel移行値 or 手入力値）
  if (a.placement_confirmed === "確定" && a.expected_referral_fee && a.expected_referral_fee > 0) {
    return a.expected_referral_fee;
  }

  // 未確定: 計算で算出（想定年収デフォルト800万）
  const salary = a.offer_salary || 8000000;
  // AI分析の確度（0-100%）があればそちらを優先、なければ手動ランクから取得
  const rankRate = (a.ai_offer_probability != null && a.ai_offer_probability > 0)
    ? a.ai_offer_probability / 100
    : getOfferRankRate(a.offer_rank);
  const feeRate = a.referral_fee_rate ?? 0.3;
  const margin = (a.margin && a.margin > 0) ? a.margin : 0.7;
  return salary * rankRate * feeRate * margin;
}

/** 顧客が人材紹介利用者か判定: 人材紹介区分が「フル利用」「一部利用」「自社」「該当」 */
export const AGENT_CATEGORIES = new Set(["フル利用", "一部利用", "自社", "該当"]);
export function isAgentCustomer(c: CustomerWithRelations): boolean {
  const cat = c.contract?.referral_category;
  return !!cat && AGENT_CATEGORIES.has(cat);
}

/** 顧客が「受講中」か判定（Excel Col BU の条件） */
export function isCurrentlyEnrolled(c: CustomerWithRelations): boolean {
  const stage = c.pipeline?.stage;
  if (stage !== "成約" && stage !== "追加指導") return false;
  if (!c.learning) return false;
  if (!c.learning.coaching_end_date) return true;
  const endDate = new Date(c.learning.coaching_end_date);
  if (isNaN(endDate.getTime())) return false;
  return endDate >= new Date();
}

/** 成約ステージか判定 */
export function isStageClosed(stage: string | undefined | null): boolean {
  if (!stage) return false;
  return stage === "成約" || stage === "追加指導" || stage === "受講終了" || stage === "卒業";
}

/** 顧客のエージェント確定フラグを判定 */
export function isAgentConfirmed(c: CustomerWithRelations): boolean {
  return c.agent?.placement_confirmed === "確定";
}

/** 補助金額算出（Excel Col EJ: リスキャリ補助金） */
export function getSubsidyAmount(c: CustomerWithRelations): number {
  if (c.contract?.subsidy_eligible) {
    return c.contract?.subsidy_amount || 0;
  }
  return 0;
}

// ================================================================
// Phase 3: 算出フィールド（Excel パリティ用）
// ================================================================

/** 直近実績ベースの成約率（外部から注入） */
export interface RecentClosingRates {
  kisotsu: number;   // 既卒の直近成約率 (0-1)
  shinsotsu: number; // 新卒の直近成約率 (0-1)
}

/** 成約見込率（Excel Col DB: IFS formula — スプレッドシート完全準拠）
 *
 * T7 = pipeline.probability（営業角度: 営業マンが報告フォームで入力する 0–1）
 * DC7 = attribute（既卒/新卒）
 * recentRates = 直近3ヶ月の既卒/新卒別成約率（未実施/日程未確のLTV計算に使用）
 */
export function calcClosingProbability(c: CustomerWithRelations, recentRates?: RecentClosingRates): number {
  const stage = c.pipeline?.stage;
  if (!stage) return 0;

  // 営業角度（T7）: DBではfloat 0–1。未設定時は既卒65%/新卒30%をデフォルト
  const raw = (c.pipeline?.probability != null && c.pipeline.probability > 0)
    ? c.pipeline.probability
    : (isShinsotsu(c.attribute) ? 0.30 : 0.65);
  const t = Math.min(raw, 1.0);

  // --- 成約系 → 100% ---
  if (stage === "成約") return 1.0;

  // --- 追加指導系（サブタイプ判定） ---
  if (stage.startsWith("追加指導")) {
    if (stage.includes("CL") || stage.toLowerCase().includes("noshow") || stage.includes("失注")) return 0;
    if (stage.includes("検討中")) return 0.30;
    // 追加指導（一般）: 営業角度 × 80%
    return t * 0.80;
  }

  // --- その他購入・動画講座購入 → 0% ---
  if (stage === "その他購入" || stage === "動画講座購入") return 0;
  if (stage.includes("成約見込")) return 0;

  // --- 全額返金 → 0% ---
  if (stage === "全額返金") return 0;

  // --- キャンセル系 → 0% ---
  if (stage === "キャンセル") return 0;

  // --- 失注系 ---
  if (stage === "失注" || stage === "失注見込(自動)") return 0;
  if (stage === "失注見込") return 0.02;

  // --- NoShow/非実施 → 0% ---
  if (stage === "NoShow" || stage === "実施不可" || stage === "非実施対象") return 0;

  // --- 保留 → 0% ---
  if (stage === "保留") return 0;

  // --- アクティブステージ: 営業角度ベース ---
  if (stage === "検討中") return t * 0.80;
  if (stage === "長期検討") return t * 0.50;
  // --- 未実施/日程未確: 直近実績ベースの成約率 × 日程確定→実施の遷移率 ---
  if (stage === "未実施") {
    if (recentRates) {
      // 日程確定済み → 実施遷移率90%を加味
      const rate = isShinsotsu(c.attribute) ? recentRates.shinsotsu : recentRates.kisotsu;
      return rate * 0.90;
    }
    return isShinsotsu(c.attribute) ? 0.15 : 0.30;
  }
  if (stage === "日程未確") return 0.05;

  // --- レガシー値 ---
  if (stage === "提案中") return t * 0.80;
  if (stage === "面談実施") return t * 0.80;
  if (stage === "問い合わせ") return 0.05;

  // デフォルト: Excel IFERROR fallback = 20%
  return 0.20;
}

/** スクール確定売上額を取得: contract_total（分割含む合計）を優先、なければconfirmed_amount */
export function getSchoolRevenue(c: CustomerWithRelations): number {
  return c.contract?.contract_total || c.contract?.confirmed_amount || 0;
}

/** 成約者見込LTV（ユーザー定義 c）= a + b（人材未確定時）OR a + c（人材確定時）
 *  a = 確定売上(スクール受講料 + 補助金)
 *  b = 人材見込売上
 *  c = 確定売上(人材)
 */
export function calcSalesProjection(c: CustomerWithRelations): number {
  const confirmed = getSchoolRevenue(c);
  const closed = isStageClosed(c.pipeline?.stage);
  const subsidy = closed ? getSubsidyAmount(c) : 0;
  const a = confirmed + subsidy;

  // 人材確定時: a + c
  if (isAgentCustomer(c) && isAgentConfirmed(c)) {
    return a + calcExpectedReferralFee(c);
  }
  // 人材未確定時: a + b
  const b = calcAgentProjectedRevenue(c);
  return a + b;
}

/** デフォルトLTV設定 */
export interface LtvConfig {
  defaultLtvKisotsu: number;
  defaultLtvShinsotsu: number;
}

export const DEFAULT_LTV_CONFIG: LtvConfig = {
  defaultLtvKisotsu: 427636,
  defaultLtvShinsotsu: 240000,
};

/** 見込LTV（d）= 成約者はc(成約者見込LTV)、未成約者は見込み成約率×見込み単価 */
export function calcExpectedLTV(c: CustomerWithRelations, config?: LtvConfig, recentRates?: RecentClosingRates): number {
  const cfg = config || DEFAULT_LTV_CONFIG;
  const salesProjection = calcSalesProjection(c);
  if (salesProjection > 0) return salesProjection;
  const defaultLTV = isShinsotsu(c.attribute) ? cfg.defaultLtvShinsotsu : cfg.defaultLtvKisotsu;
  return Math.round(defaultLTV * calcClosingProbability(c, recentRates));
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

/** 確定売上合計（e）= a + c = スクール確定(a1) + 補助金(a2) + 人材確定(c) */
export function calcConfirmedRevenue(c: CustomerWithRelations): number {
  const schoolConfirmed = getSchoolRevenue(c);
  const closed = isStageClosed(c.pipeline?.stage);
  const subsidy = closed ? getSubsidyAmount(c) : 0;
  const agentConfirmed = isAgentConfirmed(c) ? calcExpectedReferralFee(c) : 0;
  return schoolConfirmed + subsidy + agentConfirmed;
}

/** 転職活動中か判定: 「終了」以外は全て活動中とみなす */
export function isActivelyJobSearching(c: CustomerWithRelations): boolean {
  const status = c.agent?.job_search_status;
  // 「終了」のみ除外。「活動中」も未設定も活動中とみなす
  return status !== "終了";
}

/** 人材見込売上（人材紹介区分に基づく乗数）（Excel Col BU） */
export function calcAgentProjectedRevenue(c: CustomerWithRelations): number {
  if (!isActivelyJobSearching(c) || !isAgentCustomer(c) || isAgentConfirmed(c)) return 0;
  // offer_rank（S/A/B/C/D）に基づく報酬期待値をそのまま使用
  // 一部利用/フル利用の区別は廃止（確定分は calcExpectedReferralFee で100%計上済み）
  return calcExpectedReferralFee(c);
}
