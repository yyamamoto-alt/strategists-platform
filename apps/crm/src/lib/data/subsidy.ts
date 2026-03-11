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
  // Condition 3: ビヘイビア面接指導1回以上
  behaviorSessionCount: number;
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
    .in("source", ["メンター指導報告", "入塾フォーム", "教材アウトプット"])
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
      behaviorConditionMet: false,
      hasPassingEvaluation: false,
      evaluations: [],
      identityDocUrl: null,
      bankDocUrl: null,
      contractSigned: false,
      enrollmentDate: null,
      paymentDate: null,
    };
  }

  if (!histories) return result;

  for (const h of histories) {
    const cid = h.customer_id;
    if (!result[cid]) continue;
    const rd = h.raw_data || {};

    if (h.source === "メンター指導報告") {
      const kaiji = rd["回次（合計指導回数）"] || "";

      // Check if ビヘイビア
      if (typeof kaiji === "string" && kaiji.includes("ビヘイビア")) {
        result[cid].behaviorSessionCount++;
      } else {
        // Numeric case sessions
        const num = parseInt(String(kaiji), 10);
        if (!isNaN(num) && num > 0) {
          result[cid].caseSessionCount++;
          if (num === 4) {
            result[cid].hasExactFourRecord = true;
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
  }

  // Compute derived conditions
  for (const cid of customerIds) {
    const d = result[cid];
    // Condition 2: case sessions
    if (d.caseSessionCount >= 4) {
      d.caseConditionMet = true;
      d.caseConditionViaOr = false;
    } else if (d.hasExactFourRecord && d.caseSessionCount < 4) {
      // OR condition: has a record with 回次="4" but total count < 4
      d.caseConditionMet = true;
      d.caseConditionViaOr = true; // warn about potential data issue
    }
    // Condition 3: behavior
    d.behaviorConditionMet = d.behaviorSessionCount >= 1;
  }

  return result;
}

export interface SubsidyDocumentData {
  invoiceIssuedAt: string | null;
  receiptIssuedAt: string | null;
  certificateIssuedAt: string | null;
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
    .select("customer_id, doc_type, issued_at, certificate_number")
    .in("customer_id", customerIds)
    .order("issued_at", { ascending: false });

  const result: Record<string, SubsidyDocumentData> = {};
  for (const cid of customerIds) {
    result[cid] = { invoiceIssuedAt: null, receiptIssuedAt: null, certificateIssuedAt: null, certificateNumber: null };
  }

  if (data) {
    for (const row of data) {
      const cid = row.customer_id;
      if (!result[cid]) continue;
      if (row.doc_type === "invoice" && !result[cid].invoiceIssuedAt) {
        result[cid].invoiceIssuedAt = row.issued_at;
      }
      if (row.doc_type === "receipt" && !result[cid].receiptIssuedAt) {
        result[cid].receiptIssuedAt = row.issued_at;
      }
      if (row.doc_type === "certificate" && !result[cid].certificateIssuedAt) {
        result[cid].certificateIssuedAt = row.issued_at;
        result[cid].certificateNumber = row.certificate_number;
      }
    }
  }

  return result;
}
