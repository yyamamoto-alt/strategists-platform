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
  // DB の margin は integer型で 0.75 → 0 に切り捨てられている。0 は不正値なので 0.75 をデフォルト使用
  const margin = (a.margin && a.margin > 0) ? a.margin : 0.75;
  return salary * hireRate * offerProb * feeRate * margin;
}

/** 顧客が人材紹介利用者か判定: 人材紹介区分が「フル利用」or「一部利用」のみ */
export function isAgentCustomer(c: CustomerWithRelations): boolean {
  const cat = c.contract?.referral_category;
  return cat === "フル利用" || cat === "一部利用";
}

/** 顧客が「受講中」か判定（Excel Col BU の条件） */
export function isCurrentlyEnrolled(c: CustomerWithRelations): boolean {
  const stage = c.pipeline?.stage;
  if (stage !== "成約" && stage !== "入金済" && stage !== "追加指導") return false;
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

/** 成約見込率（Excel Col DB: IFS formula — スプレッドシート完全準拠）
 *
 * T7 = pipeline.probability（営業角度: 営業マンが報告フォームで入力する 0–1）
 * DC7 = attribute（既卒/新卒）
 */
export function calcClosingProbability(c: CustomerWithRelations): number {
  const stage = c.pipeline?.stage;
  if (!stage) return 0;

  // 営業角度（T7）: DBではfloat 0–1。未設定時は既卒65%/新卒30%をデフォルト
  const t = (c.pipeline?.probability != null && c.pipeline.probability > 0)
    ? c.pipeline.probability
    : (isShinsotsu(c.attribute) ? 0.30 : 0.65);

  // --- 成約系 → 100% ---
  if (stage === "成約" || stage === "入金済") return 1.0;
  if (stage === "成約(追加指導経由)" || stage === "途中解約(成約)") return 1.0;

  // --- 追加指導系（サブタイプ判定） ---
  if (stage.startsWith("追加指導")) {
    if (stage.includes("CL") || stage.includes("noshow") || stage.includes("失注")) return 0;
    if (stage.includes("検討中")) return 0.30;
    // 追加指導（一般）: 営業角度 × 80%
    return t * 0.80;
  }

  // --- その他購入・動画講座購入 → 0% ---
  if (stage === "その他購入" || stage === "動画講座購入") return 0;
  if (stage.includes("成約見込")) return 0;

  // --- CL → 5%（復帰の可能性あり） ---
  if (stage === "CL") return 0.05;
  if (stage === "全額返金") return 0;

  // --- 失注系 ---
  if (stage === "失注") return 0;
  if (stage === "失注見込" || stage === "失注見込(自動)") return 0.02;

  // --- 未実施: 面談予定だが未実施。既卒/新卒で大幅に異なる ---
  if (stage === "未実施") {
    return isShinsotsu(c.attribute) ? 0.80 * 0.30 : 0.90 * 0.65;
  }

  // --- NoShow/非実施 → 0% ---
  if (stage === "NoShow" || stage === "実施不可" || stage === "非実施対象") return 0;

  // --- 保留 → 0% ---
  if (stage === "保留" || c.pipeline?.deal_status === "保留") return 0;

  // --- アクティブステージ: 営業角度ベース ---
  if (stage === "検討中") return t * 0.80;
  if (stage === "長期検討") return t * 0.50;
  if (stage === "日程確定") return 0.20;
  if (stage === "日程未確") return 0.05;

  // --- レガシー値 ---
  if (stage === "提案中") return t * 0.80;
  if (stage === "面談実施") return t * 0.80;
  if (stage === "問い合わせ") return 0.05;

  // デフォルト: Excel IFERROR fallback = 20%
  return 0.20;
}

/** 売上見込（Excel Col N）= 確定売上 + 人材見込売上 + 補助金額 */
export function calcSalesProjection(c: CustomerWithRelations): number {
  // DB移行値を優先（Excelの計算済み値）
  if (c.pipeline?.projected_amount && c.pipeline.projected_amount > 0) {
    return c.pipeline.projected_amount;
  }
  // フォールバック: コンポーネントから再計算
  const confirmed = c.contract?.confirmed_amount || 0;
  const agentRev = calcAgentProjectedRevenue(c);
  const subsidy = getSubsidyAmount(c);
  return confirmed + agentRev + subsidy;
}

/** 見込LTV（Excel Col DD）= IF(売上見込>0, 売上見込, デフォルトLTV×成約見込率) */
export function calcExpectedLTV(c: CustomerWithRelations): number {
  const salesProjection = calcSalesProjection(c);
  if (salesProjection > 0) return salesProjection;
  const defaultLTV = isShinsotsu(c.attribute) ? 240000 : 427636;
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

/** 人材見込売上（人材紹介区分に基づく乗数）（Excel Col BU） */
export function calcAgentProjectedRevenue(c: CustomerWithRelations): number {
  if (!isCurrentlyEnrolled(c) || !isAgentCustomer(c) || isAgentConfirmed(c)) return 0;
  const fee = calcExpectedReferralFee(c);
  const cat = c.contract?.referral_category;
  let multiplier = 1.0;
  if (cat === "フル利用") multiplier = 1.0;
  else if (cat === "一部利用") multiplier = 0.5;
  return Math.round(fee * multiplier);
}
