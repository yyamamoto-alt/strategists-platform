import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export interface SubsidyCompletionData {
  customerId: string;
  // Condition 1: 教材アウトプット提出済み
  hasOutputForm: boolean;
  outputFormDate: string | null;
  // Condition 2: ケース面接指導4回以上
  caseSessionCount: number;
  hasExactFourRecord: boolean; // OR condition: 回次="4" exists
  caseConditionMet: boolean;
  caseConditionViaOr: boolean; // met via OR condition (warning)
  // Condition 3: ビヘイビア OR 追加指導 OR アセスメント OR エージェント面談（いずれか1回以上）
  behaviorSessionCount: number;
  additionalCoachingCount: number;
  assessmentCount: number;
  agentInterviewCount: number;
  behaviorConditionMet: boolean;
  // Condition 4: 総合評価が不可レベル以外を1回以上
  hasPassingEvaluation: boolean;
  evaluations: string[]; // all evaluations received
  // Documents from 入塾フォーム
  identityDocUrl: string | null;
  bankDocUrl: string | null;
  contractSigned: boolean;
  // Dates
  enrollmentDate: string | null; // 入塾フォーム timestamp
  paymentDate: string | null; // first payment date
  firstCoachingDate: string | null; // 初回指導日 (回次=1の指導報告日)
}

const PASSING_EVALUATIONS = [
  "内定獲得確実レベル",
  "内定獲得十分レベル",
  "内定獲得圏内レベル",
];

export async function fetchSubsidyCompletionData(
  customerIds: string[]
): Promise<Record<string, SubsidyCompletionData>> {
  if (customerIds.length === 0) return {};

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Batch fetch all relevant application_history for these customers
  const { data: histories } = await db
    .from("application_history")
    .select("id, customer_id, source, raw_data, applied_at")
    .in("customer_id", customerIds)
    .in("source", ["メンター指導報告", "入塾フォーム", "教材アウトプット", "エージェント面談報告フォーム"])
    .order("applied_at", { ascending: true });

  const result: Record<string, SubsidyCompletionData> = {};

  // Initialize all customers
  for (const cid of customerIds) {
    result[cid] = {
      customerId: cid,
      hasOutputForm: false,
      outputFormDate: null,
      caseSessionCount: 0,
      hasExactFourRecord: false,
      caseConditionMet: false,
      caseConditionViaOr: false,
      behaviorSessionCount: 0,
      additionalCoachingCount: 0,
      assessmentCount: 0,
      agentInterviewCount: 0,
      behaviorConditionMet: false,
      hasPassingEvaluation: false,
      evaluations: [],
      identityDocUrl: null,
      bankDocUrl: null,
      contractSigned: false,
      enrollmentDate: null,
      paymentDate: null,
      firstCoachingDate: null,
    };
  }

  if (!histories) return result;

  for (const h of histories) {
    const cid = h.customer_id;
    if (!result[cid]) continue;
    const rd = h.raw_data || {};

    if (h.source === "メンター指導報告") {
      const kaiji = rd["回次（合計指導回数）"] || "";

      // Check if ビヘイビア or 追加指導
      if (typeof kaiji === "string" && kaiji.includes("ビヘイビア")) {
        result[cid].behaviorSessionCount++;
      } else if (typeof kaiji === "string" && kaiji === "追加指導") {
        result[cid].additionalCoachingCount++;
      } else if (typeof kaiji === "string" && kaiji.includes("アセスメント")) {
        // アセスメント（条件3の独立カウント）
        result[cid].assessmentCount++;
      } else {
        // Numeric case sessions
        const num = parseInt(String(kaiji), 10);
        if (!isNaN(num) && num > 0) {
          result[cid].caseSessionCount++;
          if (num === 4) {
            result[cid].hasExactFourRecord = true;
          }
          // 初回指導日 = 回次が1のレコードの日付
          if (num === 1 && !result[cid].firstCoachingDate) {
            result[cid].firstCoachingDate = rd["タイムスタンプ"] || h.applied_at || null;
          }
        }
      }

      // 総合評価
      const evaluation = rd["総合評価（社内限り）"];
      if (evaluation) {
        result[cid].evaluations.push(evaluation);
        if (PASSING_EVALUATIONS.includes(evaluation)) {
          result[cid].hasPassingEvaluation = true;
        }
      }
    } else if (h.source === "入塾フォーム") {
      result[cid].identityDocUrl = rd["本人確認書類の写し"] || null;
      result[cid].bankDocUrl = rd["振込先口座を確認できる書類の写し"] || null;
      const contract = rd["契約書の締結をお願いします。"] || "";
      result[cid].contractSigned = contract === "締結済み";
      result[cid].enrollmentDate = rd["タイムスタンプ"] || h.applied_at || null;
    }
    if (h.source === "教材アウトプット") {
      result[cid].hasOutputForm = true;
      result[cid].outputFormDate = rd["タイムスタンプ"] || h.applied_at || null;
    }
    if (h.source === "エージェント面談報告フォーム") {
      result[cid].agentInterviewCount++;
    }
  }

  // 追加指導: パイプラインのステージ/追加指導日も確認
  const { data: pipelineData } = await db
    .from("sales_pipeline")
    .select("customer_id, stage, additional_coaching_date")
    .in("customer_id", customerIds);

  if (pipelineData) {
    for (const p of pipelineData) {
      if (!result[p.customer_id]) continue;
      if (p.stage === "追加指導" || p.additional_coaching_date) {
        result[p.customer_id].additionalCoachingCount = Math.max(result[p.customer_id].additionalCoachingCount, 1);
      }
    }
  }

  // Compute derived conditions
  for (const cid of customerIds) {
    const d = result[cid];
    // Condition 2: case sessions
    // アセスメント+追加指導の両方実施でケース1回分としてカウント（ボタン表示には影響しない）
    const bonusCase = (d.assessmentCount >= 1 && d.additionalCoachingCount >= 1) ? 1 : 0;
    const effectiveCaseCount = d.caseSessionCount + bonusCase;
    if (effectiveCaseCount >= 4) {
      d.caseConditionMet = true;
      d.caseConditionViaOr = false;
    } else if (d.hasExactFourRecord && effectiveCaseCount < 4) {
      // OR condition: has a record with 回次="4" but total count < 4
      d.caseConditionMet = true;
      d.caseConditionViaOr = true; // warn about potential data issue
    }
    // Condition 3: behavior OR additional coaching OR assessment OR agent interview
    d.behaviorConditionMet = d.behaviorSessionCount >= 1 || d.additionalCoachingCount >= 1 || d.assessmentCount >= 1 || d.agentInterviewCount >= 1;
  }

  return result;
}

export interface SubsidyDocumentData {
  invoiceIssuedAt: string | null;
  invoiceSentAt: string | null;
  receiptIssuedAt: string | null;
  receiptSentAt: string | null;
  certificateIssuedAt: string | null;
  certificateSentAt: string | null;
  certificateNumber: string | null;
}

/** Fetch issued subsidy documents (invoices, receipts, and certificates) */
export async function fetchSubsidyDocuments(
  customerIds: string[]
): Promise<Record<string, SubsidyDocumentData>> {
  if (customerIds.length === 0) return {};

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from("subsidy_documents")
    .select("customer_id, doc_type, issued_at, email_sent_at, certificate_number")
    .in("customer_id", customerIds)
    .order("issued_at", { ascending: false });

  const result: Record<string, SubsidyDocumentData> = {};
  for (const cid of customerIds) {
    result[cid] = { invoiceIssuedAt: null, invoiceSentAt: null, receiptIssuedAt: null, receiptSentAt: null, certificateIssuedAt: null, certificateSentAt: null, certificateNumber: null };
  }

  if (data) {
    for (const row of data) {
      const cid = row.customer_id;
      if (!result[cid]) continue;
      if (row.doc_type === "invoice" && !result[cid].invoiceIssuedAt) {
        result[cid].invoiceIssuedAt = row.issued_at;
        result[cid].invoiceSentAt = row.email_sent_at;
      }
      if (row.doc_type === "receipt" && !result[cid].receiptIssuedAt) {
        result[cid].receiptIssuedAt = row.issued_at;
        result[cid].receiptSentAt = row.email_sent_at;
      }
      if (row.doc_type === "certificate" && !result[cid].certificateIssuedAt) {
        result[cid].certificateIssuedAt = row.issued_at;
        result[cid].certificateSentAt = row.email_sent_at;
        result[cid].certificateNumber = row.certificate_number;
      }
    }
  }

  return result;
}

export interface SubsidyCheckData {
  identityDocVerified: boolean;
  bankDocVerified: boolean;
  contractVerified: boolean;
}

export async function fetchSubsidyChecks(
  customerIds: string[]
): Promise<Record<string, SubsidyCheckData>> {
  if (customerIds.length === 0) return {};

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from("subsidy_checks")
    .select("customer_id, identity_doc_verified, bank_doc_verified, contract_verified")
    .in("customer_id", customerIds);

  const result: Record<string, SubsidyCheckData> = {};
  for (const cid of customerIds) {
    result[cid] = { identityDocVerified: false, bankDocVerified: false, contractVerified: false };
  }

  if (data) {
    for (const row of data) {
      result[row.customer_id] = {
        identityDocVerified: row.identity_doc_verified || false,
        bankDocVerified: row.bank_doc_verified || false,
        contractVerified: row.contract_verified || false,
      };
    }
  }

  return result;
}
