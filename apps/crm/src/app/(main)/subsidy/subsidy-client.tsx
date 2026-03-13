"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import type { CustomerWithRelations } from "@strategy-school/shared-db";
import { isShinsotsu } from "@/lib/calc-fields";
import { formatCurrency, getStageColor } from "@/lib/utils";
import { SpreadsheetTable, type SpreadsheetColumn } from "@/components/spreadsheet-table";

// ================================================================
// Types
// ================================================================

interface SubsidyCompletionData {
  customerId: string;
  hasOutputForm: boolean;
  outputFormDate: string | null;
  caseSessionCount: number;
  hasExactFourRecord: boolean;
  caseConditionMet: boolean;
  caseConditionViaOr: boolean;
  behaviorSessionCount: number;
  additionalCoachingCount: number;
  behaviorConditionMet: boolean;
  hasPassingEvaluation: boolean;
  evaluations: string[];
  identityDocUrl: string | null;
  bankDocUrl: string | null;
  contractSigned: boolean;
  enrollmentDate: string | null;
  paymentDate: string | null;
  firstCoachingDate: string | null;
}

interface DocumentData {
  invoiceIssuedAt: string | null;
  receiptIssuedAt: string | null;
  certificateIssuedAt: string | null;
  certificateNumber: string | null;
}

interface SubsidyCheckData {
  identityDocVerified: boolean;
  bankDocVerified: boolean;
}

interface Props {
  customers: CustomerWithRelations[];
  firstPaidMap: Record<string, string>;
  completionData: Record<string, SubsidyCompletionData>;
  documentData: Record<string, DocumentData>;
  checksData: Record<string, SubsidyCheckData>;
}

// ================================================================
// Constants
// ================================================================

const SUBSIDY_START = "2026-02-10";
const RESKILLING_UNIT = 203636;

// ================================================================
// Utility functions
// ================================================================

function normalizeDate(d: string | null | undefined): string {
  if (!d) return "";
  return d.replace(/\//g, "-").split("T")[0].split(" ")[0];
}

function formatDateJP(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(normalizeDate(d) + "T00:00:00");
  if (isNaN(date.getTime())) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 補助金対象判定（対象者リスト用）: contracts.subsidy_eligible=true かつ 成約済み */
function isSubsidyTarget(c: CustomerWithRelations): boolean {
  if (!c.contract?.subsidy_eligible) return false;
  if (c.pipeline?.stage !== "成約") return false;
  return true;
}

/** 補助金推移用の集客対象判定（元の日付ベース定義）:
 *  既卒で、申し込み日が2/10以降 OR 営業日が2/10以降（未実施/日程未確/NoShow除く） */
function isSubsidyCollectionTarget(c: CustomerWithRelations): boolean {
  if (isShinsotsu(c.attribute)) return false;
  const appDate = normalizeDate(c.application_date);
  const salesDate = normalizeDate(c.pipeline?.sales_date);
  if (appDate > SUBSIDY_START) return true;
  if (salesDate > SUBSIDY_START) {
    const stage = c.pipeline?.stage;
    if (stage === "未実施" || stage === "日程未確" || stage === "NoShow") return false;
    return true;
  }
  return false;
}

function getSubsidyDate(c: CustomerWithRelations): string {
  const appDate = normalizeDate(c.application_date);
  if (appDate > SUBSIDY_START) return appDate;
  return normalizeDate(c.pipeline?.sales_date);
}

function isSupportStarted(c: CustomerWithRelations): boolean {
  const stage = c.pipeline?.stage;
  if (!stage) return false;
  return stage !== "日程未確" && stage !== "未実施";
}

function isCourseStarted(c: CustomerWithRelations): boolean {
  return c.pipeline?.stage === "成約";
}

function getAttributeColor(attr: string | null | undefined): string {
  if (!attr) return "bg-gray-700 text-gray-400";
  if (attr === "既卒") return "bg-blue-900/60 text-blue-300";
  if (attr === "新卒") return "bg-green-900/60 text-green-300";
  return "bg-gray-700 text-gray-400";
}

/** 修了条件の達成数を計算（目視確認含む5条件） */
function getConditionScore(d: SubsidyCompletionData | undefined, chk: SubsidyCheckData | undefined): { met: number; total: number } {
  if (!d) return { met: 0, total: 5 };
  let met = 0;
  if (d.hasOutputForm) met++;
  if (d.caseConditionMet) met++;
  if (d.behaviorConditionMet) met++;
  if (d.hasPassingEvaluation) met++;
  if (chk?.identityDocVerified && chk?.bankDocVerified) met++;
  return { met, total: 5 };
}

/** 入金日から2週間経過しても初回指導日が未入力の場合の警告 */
function isTwoWeeksPastPayment(paymentDate: string | null | undefined, firstCoachingDate: string | null | undefined): boolean {
  if (!paymentDate || firstCoachingDate) return false;
  const pd = new Date(normalizeDate(paymentDate) + "T00:00:00");
  if (isNaN(pd.getTime())) return false;
  const twoWeeksLater = new Date(pd);
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
  return new Date() > twoWeeksLater;
}

/** 1ヶ月経過チェック */
function isOneMonthPassed(enrollmentDate: string | null | undefined): boolean {
  if (!enrollmentDate) return false;
  const d = new Date(normalizeDate(enrollmentDate) || enrollmentDate);
  if (isNaN(d.getTime())) return false;
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  return d < oneMonthAgo;
}

/** アラート判定 */
function getAlerts(d: SubsidyCompletionData | undefined): string[] {
  if (!d) return [];
  const alerts: string[] = [];
  const passed = isOneMonthPassed(d.enrollmentDate);
  if (!passed) return [];

  if (!d.hasOutputForm) alerts.push("教材アウトプット未提出");
  if (d.caseSessionCount <= 2) alerts.push(`ケース面接指導 ${d.caseSessionCount}/4回`);
  if (!d.hasPassingEvaluation) alerts.push("内定獲得圏内以上の評価なし");
  return alerts;
}

// ================================================================
// Week/Month helpers (existing)
// ================================================================

function generateWeekEnds(): string[] {
  const weeks: string[] = [];
  const start = new Date(2026, 1, 15);
  const today = new Date();
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 7);
  let current = new Date(start);
  while (current <= limit) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    const dd = String(current.getDate()).padStart(2, "0");
    weeks.push(`${yyyy}-${mm}-${dd}`);
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}まで`;
}

function generateMonths(): string[] {
  const months: string[] = [];
  const start = new Date(2026, 1, 1);
  const today = new Date();
  const limit = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  let current = new Date(start);
  while (current < limit) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}-${mm}`);
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

function formatMonthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${y}年${parseInt(mm)}月`;
}

// ================================================================
// Condition Badge Component
// ================================================================

function ConditionBadge({ label, met, warning }: { label: string; met: boolean; warning?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold ${
        met ? "bg-green-600 text-white" : "bg-red-600/80 text-white"
      }`}>
        {met ? "✓" : "✗"}
      </span>
      <span className={`text-xs ${met ? "text-green-400" : "text-red-400"}`}>{label}</span>
      {warning && (
        <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1 rounded" title={warning}>
          !
        </span>
      )}
    </div>
  );
}

// ================================================================
// Document Preview Modal
// ================================================================

type DocType = "invoice" | "receipt" | "certificate";

interface DocModalState {
  open: boolean;
  type: DocType;
  customer: CustomerWithRelations | null;
  completion: SubsidyCompletionData | null;
}

function InvoicePreview({ customer, paymentDate }: { customer: CustomerWithRelations; paymentDate: string }) {
  return (
    <div className="bg-white text-black p-8 rounded-lg max-w-[600px] mx-auto text-sm leading-relaxed" id="doc-preview">
      <p className="text-right mb-4">支払い通知日<br />{paymentDate}</p>
      <h2 className="text-center text-lg font-bold mb-6">請求書/受講料明細書</h2>
      <p className="mb-4">{customer.name}様</p>
      <p className="mb-4">補助事業者：株式会社トップティア</p>
      <p className="mb-6">以下のとおりご請求します。</p>
      <table className="w-full mb-6 border-collapse">
        <tbody>
          <tr className="border-b"><td className="py-2">講座受講料</td><td className="text-right py-2">407,273円</td></tr>
          <tr className="border-b"><td className="py-2">消費税</td><td className="text-right py-2">40,727円</td></tr>
          <tr className="border-b font-bold"><td className="py-2">合計</td><td className="text-right py-2">448,000円</td></tr>
          <tr className="border-b"><td className="py-2">リスキリングを通じたキャリアアップ支援事業補填金</td><td className="text-right py-2">203,636円</td></tr>
          <tr className="border-b"><td className="py-2">当社負担による受講料補填：20,364円</td><td className="text-right py-2" /></tr>
          <tr className="border-b font-bold text-lg"><td className="py-2">差引請求額</td><td className="text-right py-2">224,000円</td></tr>
        </tbody>
      </table>
      <div className="text-[10px] text-gray-600 leading-relaxed mt-4">
        <p>※リスキリングを通じたキャリアアップ支援事業補填金は公的な国庫補助金を財源とした補填金であり、資産の譲渡等の対価として支払うものではないことから、消費税は不課税です。</p>
        <p className="mt-1">※リスキリングを通じたキャリアアップ支援事業補填金は一時所得扱いです。他の一時所得と合算して年間50万円を超える場合は確定申告が必要です。一時所得は、所得金額の計算上、特別控除額を控除することとされており、他の一時所得とされる所得との合計額が年間50万円を超えない限り、原則として、本事業による補助を理由として、確定申告をする必要はありません。また、一般的な給与所得者の方については、その給与以外の所得金額が年間20万円を超えない場合には、確定申告をする必要がないこととされており、一時所得については、50万円を控除した残額に2分の1を乗じた金額によって所得税額を計算することとされていますので、他の一時所得とされる所得との合計額が90万円を超えない限り、確定申告をする必要はありません。</p>
      </div>
    </div>
  );
}

function ReceiptPreview({ customer, paymentDate }: { customer: CustomerWithRelations; paymentDate: string }) {
  return (
    <div className="bg-white text-black p-8 rounded-lg max-w-[600px] mx-auto text-sm leading-relaxed" id="doc-preview">
      <h2 className="text-center text-xl font-bold mb-8 border-b-2 border-black pb-2">領 収 書</h2>
      <p className="text-right mb-6">{paymentDate}</p>
      <p className="text-lg mb-6 border-b border-black pb-1">{customer.name} 様</p>
      <div className="text-center my-8">
        <p className="text-sm text-gray-600 mb-1">金額</p>
        <p className="text-2xl font-bold">¥224,000-<span className="text-sm font-normal ml-1">（税込）</span></p>
      </div>
      <p className="mb-8">但し コンサルタント養成講座受講料として<br />上記正に領収いたしました。</p>
      <div className="mt-8 border-t pt-4">
        <p className="font-bold">株式会社トップティア</p>
        <p>代表取締役 山本雄大</p>
        <p className="text-xs text-gray-600 mt-1">〒150-0021 東京都渋谷区恵比寿西一丁目33番6号 JP noie 恵比寿西 1F</p>
      </div>
    </div>
  );
}

function CertificatePreview({ customer, certNumber, startDate, endDate }: {
  customer: CustomerWithRelations;
  certNumber: string;
  startDate: string;
  endDate: string;
}) {
  return (
    <div className="bg-white text-black p-8 rounded-lg max-w-[600px] mx-auto text-sm leading-relaxed" id="doc-preview">
      <p className="text-right text-xs text-gray-500 mb-4">通し番号：{certNumber}</p>
      <h2 className="text-center text-xl font-bold mb-8">修了証明書</h2>
      <p className="mb-2 text-xs text-gray-600">{"（住所は手動で入力してください）"}</p>
      <p className="mb-6 text-lg">{customer.name} 殿</p>
      <p className="mb-6 leading-relaxed">
        あなたは、経済産業省「リスキリングを通じたキャリアアップ支援事業」の補助事業を通じ、
        「戦略的思考力育成・コンサルタント養成講座（講座番号：1）」を修了されましたので、これを証します。
      </p>
      <div className="mb-6 space-y-1">
        <p>受講開始日：{startDate}</p>
        <p>受講終了日：{endDate}</p>
        <p>講座の受講金額（税抜）：407,273円</p>
      </div>
      <div className="mt-8 text-right">
        <p className="font-bold">株式会社トップティア</p>
        <p>代表取締役社長 山本雄大</p>
      </div>
    </div>
  );
}

function DocumentModal({
  state,
  onClose,
  firstPaidMap,
}: {
  state: DocModalState;
  onClose: () => void;
  firstPaidMap: Record<string, string>;
}) {
  const customer = state.customer;
  const completion = state.completion;
  if (!state.open || !customer) return null;

  const defaultPaymentDate = firstPaidMap[customer.id] || customer.contract?.payment_date || "";
  const [paymentDate, setPaymentDate] = useState(defaultPaymentDate);
  const [startDate, setStartDate] = useState(defaultPaymentDate);
  const [endDate, setEndDate] = useState("");
  const [certNumber, setCertNumber] = useState("00001");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState(false);

  const customerEmail = customer.email || "";

  const typeLabel = state.type === "invoice" ? "請求書/明細書" : state.type === "receipt" ? "領収書" : "修了証明書";

  // Check conditions for certificate
  const conditionWarnings: string[] = [];
  if (state.type === "certificate" && completion) {
    if (!completion.hasOutputForm) conditionWarnings.push("教材アウトプット未提出");
    if (!completion.caseConditionMet) conditionWarnings.push(`ケース面接指導 ${completion.caseSessionCount}/4回`);
    if (!completion.behaviorConditionMet) conditionWarnings.push("ビヘイビア面接指導 未実施");
    if (!completion.hasPassingEvaluation) conditionWarnings.push("内定獲得圏内以上の評価なし");
  }

  const handleIssue = async () => {
    setIssuing(true);
    try {
      // 領収書はメール送付も同時に行う
      const shouldSendEmail = state.type === "receipt" && !!customerEmail;
      const res = await fetch("/api/subsidy/issue-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          docType: state.type,
          customerName: customer.name,
          customerEmail,
          paymentDate,
          startDate,
          endDate,
          sendEmail: shouldSendEmail,
        }),
      });
      const data = await res.json();
      if (data.certificateNumber) setCertNumber(data.certificateNumber);
      setIssued(true);
      if (shouldSendEmail && data.emailSentAt) setSent(true);
    } catch (e) {
      console.error("Issue failed:", e);
    } finally {
      setIssuing(false);
    }
  };

  const handleSendEmail = async () => {
    setSending(true);
    try {
      await fetch("/api/subsidy/issue-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          docType: state.type,
          customerName: customer.name,
          customerEmail,
          paymentDate,
          startDate,
          endDate,
          sendEmail: true,
        }),
      });
      setSent(true);
    } catch (e) {
      console.error("Send failed:", e);
    } finally {
      setSending(false);
    }
  };

  const handlePrint = () => {
    const el = document.getElementById("doc-preview");
    if (!el) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>${typeLabel} - ${customer.name}</title>
      <style>
        body { font-family: 'Hiragino Kaku Gothic Pro', 'Yu Gothic', sans-serif; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 8px 4px; }
        @media print { body { padding: 40px; } }
      </style></head>
      <body>${el.innerHTML}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-card border border-white/10 rounded-2xl w-[90vw] max-w-[800px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">{typeLabel}の発行</h3>
            <p className="text-sm text-gray-400">{customer.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>

        {/* Condition warnings for certificate */}
        {state.type === "certificate" && conditionWarnings.length > 0 && (
          <div className="mx-6 mt-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg">
            <p className="text-sm font-bold text-red-400 mb-1">未達成の修了条件があります</p>
            {conditionWarnings.map((w) => (
              <p key={w} className="text-xs text-red-300">• {w}</p>
            ))}
          </div>
        )}

        {/* Condition check for receipt - document verification */}
        {state.type === "receipt" && completion && (
          <div className="mx-6 mt-4 p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
            <p className="text-sm font-bold text-blue-400 mb-1">書類確認状況</p>
            <p className="text-xs text-blue-300">
              本人確認書類: {completion.identityDocUrl ? "✅ 提出済み" : "❌ 未提出"}
            </p>
            <p className="text-xs text-blue-300">
              振込先書類: {completion.bankDocUrl ? "✅ 提出済み" : "❌ 未提出"}
            </p>
            <p className="text-xs text-blue-300">
              契約書締結: {completion.contractSigned ? "📋 自己申告済（要目視確認）" : "❌ 未確認"}
            </p>
          </div>
        )}

        {/* Form inputs */}
        <div className="px-6 py-4 space-y-3">
          {(state.type === "invoice" || state.type === "receipt") && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                {state.type === "invoice" ? "支払い通知日（入金日）" : "発行日"}
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-48 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white"
              />
            </div>
          )}
          {state.type === "certificate" && (
            <>
              <div>
                <label className="text-xs text-gray-400 block mb-1">受講開始日</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-48 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">受講終了日</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-48 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white"
                />
              </div>
            </>
          )}
        </div>

        {/* Preview */}
        <div className="px-6 pb-4">
          <p className="text-xs text-gray-500 mb-2">プレビュー</p>
          <div className="border border-white/10 rounded-lg overflow-hidden">
            {state.type === "invoice" && <InvoicePreview customer={customer} paymentDate={formatDateJP(paymentDate) || paymentDate} />}
            {state.type === "receipt" && <ReceiptPreview customer={customer} paymentDate={formatDateJP(paymentDate) || paymentDate} />}
            {state.type === "certificate" && (
              <CertificatePreview
                customer={customer}
                certNumber={certNumber}
                startDate={formatDateJP(startDate) || startDate}
                endDate={formatDateJP(endDate) || endDate}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
          <button
            onClick={handlePrint}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
          >
            PDF印刷
          </button>
          <div className="flex gap-2">
            {!issued ? (
              <button
                onClick={handleIssue}
                disabled={issuing || (state.type === "receipt" && !customerEmail)}
                className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-colors"
                title={state.type === "receipt" && !customerEmail ? "メールアドレス未登録のため送付できません" : undefined}
              >
                {issuing
                  ? (state.type === "receipt" ? "送付中..." : "登録中...")
                  : (state.type === "receipt"
                    ? `${customerEmail} にメール送付`
                    : "発行記録を登録")}
              </button>
            ) : (
              <>
                <span className="text-xs text-green-400 self-center mr-2">
                  {sent ? "送付済み" : "登録済み"}
                </span>
                {!sent && state.type !== "receipt" && (
                  <button
                    onClick={handleSendEmail}
                    disabled={sending || !customerEmail}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
                    title={!customerEmail ? "メールアドレス未登録" : `${customerEmail} に送信（CC: support@）`}
                  >
                    {sending ? "送信中..." : `メール送信`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// Customer Detail Modal
// ================================================================

function CustomerDetailModal({
  customer,
  completion,
  documents,
  checks,
  onClose,
  onOpenDoc,
  onToggleCheck,
}: {
  customer: CustomerWithRelations;
  completion: SubsidyCompletionData | undefined;
  documents: DocumentData | undefined;
  checks: SubsidyCheckData | undefined;
  onClose: () => void;
  onOpenDoc: (type: DocType) => void;
  onToggleCheck?: (field: "identity_doc_verified" | "bank_doc_verified") => void;
}) {
  const alerts = getAlerts(completion);
  const d = completion;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-card border border-white/10 rounded-2xl w-[90vw] max-w-[700px] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <Link href={`/customers/${customer.id}`} className="text-lg font-bold text-brand hover:underline">
              {customer.name}
            </Link>
            <p className="text-sm text-gray-400">{customer.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mx-6 mt-4 p-3 bg-amber-900/30 border border-amber-500/30 rounded-lg">
            <p className="text-sm font-bold text-amber-400 mb-1">進捗アラート（受講開始から1ヶ月経過）</p>
            {alerts.map((a) => (
              <p key={a} className="text-xs text-amber-300">⚠️ {a}</p>
            ))}
          </div>
        )}

        {/* Conditions */}
        <div className="px-6 py-4">
          <h4 className="text-sm font-bold text-white mb-3">修了条件</h4>
          <div className="grid grid-cols-2 gap-3">
            {/* Condition 1: 教材アウトプット */}
            <div className={`p-3 rounded-lg border ${d?.hasOutputForm ? "border-green-500/30 bg-green-900/10" : "border-red-500/30 bg-red-900/10"}`}>
              <ConditionBadge label="教材アウトプット" met={d?.hasOutputForm || false} />
              <p className="text-[10px] text-gray-500 mt-1">教科書・動画講座の視聴完了申告</p>
              {d?.outputFormDate && <p className="text-[10px] text-gray-400 mt-0.5">提出日: {d.outputFormDate}</p>}
            </div>

            {/* Condition 2: ケース面接4回以上 — circle progress */}
            <div className={`p-3 rounded-lg border ${d?.caseConditionMet ? "border-green-500/30 bg-green-900/10" : "border-red-500/30 bg-red-900/10"}`}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">ケース面接</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <span
                      key={n}
                      className={`w-4 h-4 rounded-full border-2 ${
                        n <= (d?.caseSessionCount || 0)
                          ? "bg-green-500 border-green-400"
                          : "bg-transparent border-gray-600"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-gray-500">{d?.caseSessionCount || 0}/4</span>
                {d?.caseConditionViaOr && (
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1 rounded" title="回次=4のレコードで条件達成">!</span>
                )}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">マンツーマン指導4時間以上</p>
            </div>

            {/* Condition 3: ビヘイビア OR 追加指導 */}
            <div className={`p-3 rounded-lg border ${d?.behaviorConditionMet ? "border-green-500/30 bg-green-900/10" : "border-red-500/30 bg-red-900/10"}`}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">Behavior面接</span>
                <span
                  className={`w-4 h-4 rounded-full border-2 ${
                    (d?.behaviorSessionCount || 0) >= 1
                      ? "bg-green-500 border-green-400"
                      : "bg-transparent border-gray-600"
                  }`}
                />
                <span className="text-[10px] text-gray-500">{d?.behaviorSessionCount || 0}回</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-300">追加指導</span>
                <span
                  className={`w-4 h-4 rounded-full border-2 ${
                    (d?.additionalCoachingCount || 0) >= 1
                      ? "bg-green-500 border-green-400"
                      : "bg-transparent border-gray-600"
                  }`}
                />
                <span className="text-[10px] text-gray-500">{d?.additionalCoachingCount || 0}回</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">どちらか1回以上で条件達成</p>
            </div>

            {/* Condition 4: 総合評価 */}
            <div className={`p-3 rounded-lg border ${d?.hasPassingEvaluation ? "border-green-500/30 bg-green-900/10" : "border-red-500/30 bg-red-900/10"}`}>
              <ConditionBadge label="総合評価" met={d?.hasPassingEvaluation || false} />
              <p className="text-[10px] text-gray-500 mt-1">内定獲得圏内レベル以上を1回以上</p>
              {d?.evaluations && d.evaluations.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {d.evaluations.map((e, i) => (
                    <span
                      key={i}
                      className={`text-[9px] px-1 py-0.5 rounded ${
                        e === "内定獲得不可レベル"
                          ? "bg-red-900/40 text-red-300"
                          : "bg-green-900/40 text-green-300"
                      }`}
                    >
                      {e.replace("内定獲得", "").replace("レベル", "")}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Condition 5: 目視確認 */}
            <div className={`p-3 rounded-lg border ${
              checks?.identityDocVerified && checks?.bankDocVerified
                ? "border-green-500/30 bg-green-900/10"
                : "border-red-500/30 bg-red-900/10"
            }`}>
              <ConditionBadge label="書類目視確認" met={(checks?.identityDocVerified && checks?.bankDocVerified) || false} />
              <p className="text-[10px] text-gray-500 mt-1">本人確認書類・振込先書類の両方を目視確認</p>
              <div className="mt-1 flex gap-2">
                <span className={`text-[9px] px-1 py-0.5 rounded ${checks?.identityDocVerified ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
                  ID: {checks?.identityDocVerified ? "確認済" : "未確認"}
                </span>
                <span className={`text-[9px] px-1 py-0.5 rounded ${checks?.bankDocVerified ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
                  口座: {checks?.bankDocVerified ? "確認済" : "未確認"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Documents status */}
        <div className="px-6 py-4 border-t border-white/10">
          <h4 className="text-sm font-bold text-white mb-3">提出書類</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className={`text-xs ${checks?.identityDocVerified ? "text-green-400" : d?.identityDocUrl ? "text-amber-400" : "text-red-400"}`}>
                  {checks?.identityDocVerified ? "✅" : d?.identityDocUrl ? "📎" : "❌"} 本人確認書類
                </span>
                {d?.identityDocUrl && (
                  <a href={d.identityDocUrl.split(",")[0].trim()} target="_blank" rel="noopener" className="text-[10px] text-brand hover:underline">
                    確認
                  </a>
                )}
                {d?.identityDocUrl && !checks?.identityDocVerified && (
                  <span className="text-[9px] text-amber-400">要目視</span>
                )}
              </div>
              {checks && (
                <button
                  onClick={() => onToggleCheck?.("identity_doc_verified")}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                    checks.identityDocVerified
                      ? "bg-green-900/40 text-green-300 border-green-500/30"
                      : "bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-400"
                  }`}
                >
                  {checks.identityDocVerified ? "✓ 目視確認済み" : "目視未確認"}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className={`text-xs ${checks?.bankDocVerified ? "text-green-400" : d?.bankDocUrl ? "text-amber-400" : "text-red-400"}`}>
                  {checks?.bankDocVerified ? "✅" : d?.bankDocUrl ? "📎" : "❌"} 振込先書類
                </span>
                {d?.bankDocUrl && (
                  <a href={d.bankDocUrl.split(",")[0].trim()} target="_blank" rel="noopener" className="text-[10px] text-brand hover:underline">
                    確認
                  </a>
                )}
                {d?.bankDocUrl && !checks?.bankDocVerified && (
                  <span className="text-[9px] text-amber-400">要目視</span>
                )}
              </div>
              {checks && (
                <button
                  onClick={() => onToggleCheck?.("bank_doc_verified")}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                    checks.bankDocVerified
                      ? "bg-green-900/40 text-green-300 border-green-500/30"
                      : "bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-400"
                  }`}
                >
                  {checks.bankDocVerified ? "✓ 目視確認済み" : "目視未確認"}
                </button>
              )}
            </div>
            <div className="p-2 rounded-lg bg-white/[0.02]">
              <span className={`text-xs ${d?.contractSigned ? "text-amber-400" : "text-red-400"}`}>
                {d?.contractSigned ? "📋 自己申告済（要目視確認）" : "❌ 未確認"} 契約書締結
              </span>
            </div>
          </div>
        </div>

        {/* Document actions */}
        <div className="px-6 py-4 border-t border-white/10">
          <h4 className="text-sm font-bold text-white mb-3">書類発行</h4>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => onOpenDoc("invoice")}
              className="p-4 rounded-lg border-2 border-dashed border-white/20 hover:border-brand/50 hover:bg-brand/5 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">📄</span>
                <p className="text-xs font-bold text-white group-hover:text-brand transition-colors">請求書/明細書</p>
              </div>
              <p className="text-[10px] text-gray-500">入塾時に発行</p>
              {documents?.invoiceIssuedAt ? (
                <p className="text-[10px] text-green-400 mt-2">✅ 発行済み: {normalizeDate(documents.invoiceIssuedAt)}</p>
              ) : (
                <p className="text-[10px] text-brand/60 mt-2 group-hover:text-brand">クリックして発行 →</p>
              )}
            </button>
            <button
              onClick={() => onOpenDoc("receipt")}
              className="p-4 rounded-lg border-2 border-dashed border-white/20 hover:border-brand/50 hover:bg-brand/5 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🧾</span>
                <p className="text-xs font-bold text-white group-hover:text-brand transition-colors">領収書</p>
              </div>
              <p className="text-[10px] text-gray-500">書類目視確認後に発行</p>
              {documents?.receiptIssuedAt ? (
                <p className="text-[10px] text-green-400 mt-2">✅ 発行済み: {normalizeDate(documents.receiptIssuedAt)}</p>
              ) : (
                <p className="text-[10px] text-brand/60 mt-2 group-hover:text-brand">クリックして発行 →</p>
              )}
            </button>
            <button
              onClick={() => onOpenDoc("certificate")}
              className="p-4 rounded-lg border-2 border-dashed border-white/20 hover:border-brand/50 hover:bg-brand/5 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🎓</span>
                <p className="text-xs font-bold text-white group-hover:text-brand transition-colors">修了証明書</p>
              </div>
              <p className="text-[10px] text-gray-500">修了条件達成後に発行</p>
              {documents?.certificateIssuedAt ? (
                <p className="text-[10px] text-green-400 mt-2">
                  ✅ 発行済み: {normalizeDate(documents.certificateIssuedAt)}
                  {documents.certificateNumber && ` (No.${documents.certificateNumber})`}
                </p>
              ) : (
                <p className="text-[10px] text-brand/60 mt-2 group-hover:text-brand">クリックして発行 →</p>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// Table columns
// ================================================================

function buildColumns(
  paidMap: Record<string, string>,
  completionData: Record<string, SubsidyCompletionData>,
  documentData: Record<string, DocumentData>,
  checksData: Record<string, SubsidyCheckData>,
  onRowClick: (c: CustomerWithRelations) => void,
  onToggleCheck: (customerId: string, field: "identity_doc_verified" | "bank_doc_verified") => void,
): SpreadsheetColumn<CustomerWithRelations>[] {
  return [
    {
      key: "name",
      label: "名前",
      width: 140,
      stickyLeft: 0,
      sortValue: (c) => c.name || "",
      render: (c) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRowClick(c)}
            className="text-brand hover:underline font-medium truncate text-left"
          >
            {c.name}
          </button>
          <a
            href={`/customers/${c.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-gray-500 hover:text-brand transition-colors"
            title="顧客詳細を別タブで開く"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V9" /><path d="M10 2h4v4" /><path d="M14 2L7 9" /></svg>
          </a>
        </div>
      ),
    },
    {
      key: "attribute",
      label: "属性",
      width: 48,
      sortValue: (c) => c.attribute || "",
      render: (c) => (
        <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${getAttributeColor(c.attribute)}`}>
          {c.attribute || "-"}
        </span>
      ),
    },
    {
      key: "stage",
      label: "ステージ",
      width: 90,
      sortValue: (c) => c.pipeline?.stage || "",
      render: (c) => {
        const s = c.pipeline?.stage || "-";
        return <span className={`text-xs px-1.5 py-0.5 rounded ${getStageColor(s)}`}>{s}</span>;
      },
    },
    {
      key: "first_coaching",
      label: "初回指導日",
      width: 100,
      sortValue: (c) => { const d = completionData[c.id]; return d?.firstCoachingDate ? normalizeDate(d.firstCoachingDate) : ""; },
      render: (c) => {
        const d = completionData[c.id];
        const dateStr = d?.firstCoachingDate ? normalizeDate(d.firstCoachingDate) : null;
        const payDate = paidMap[c.id] || c.contract?.payment_date || null;
        const warn = isTwoWeeksPastPayment(payDate, d?.firstCoachingDate);
        return (
          <span className={`text-xs ${warn ? "text-red-400 font-bold" : "text-gray-300"}`}>
            {dateStr || (warn ? "⚠️ 未設定" : "-")}
          </span>
        );
      },
    },
    {
      key: "payment_date",
      label: "入金日",
      width: 90,
      sortValue: (c) => paidMap[c.id] || c.contract?.payment_date || "",
      render: (c) => <span className="text-gray-300 text-xs">{paidMap[c.id] || c.contract?.payment_date || "-"}</span>,
    },
    {
      key: "coaching_end",
      label: "指導終了日",
      width: 100,
      sortValue: (c) => {
        const d = completionData[c.id];
        const candidates: Date[] = [];
        const coachStr = d?.firstCoachingDate ? normalizeDate(d.firstCoachingDate) : null;
        if (coachStr) { const cd = new Date(coachStr); if (!isNaN(cd.getTime())) { cd.setMonth(cd.getMonth() + 2); candidates.push(cd); } }
        const payStr = d?.paymentDate ? normalizeDate(d.paymentDate) : null;
        if (payStr) { const pd = new Date(payStr); if (!isNaN(pd.getTime())) { pd.setMonth(pd.getMonth() + 3); candidates.push(pd); } }
        if (candidates.length === 0) return "";
        const end = candidates.reduce((a, b) => a < b ? a : b);
        return end.toISOString().slice(0, 10);
      },
      render: (c) => {
        const d = completionData[c.id];
        const candidates: Date[] = [];
        // 初回指導日 + 2ヶ月
        const coachStr = d?.firstCoachingDate ? normalizeDate(d.firstCoachingDate) : null;
        if (coachStr) {
          const cd = new Date(coachStr + "T00:00:00");
          if (!isNaN(cd.getTime())) { cd.setMonth(cd.getMonth() + 2); candidates.push(cd); }
        }
        // 入金日 + 3ヶ月
        const payStr = d?.paymentDate ? normalizeDate(d.paymentDate) : null;
        if (payStr) {
          const pd = new Date(payStr + "T00:00:00");
          if (!isNaN(pd.getTime())) { pd.setMonth(pd.getMonth() + 3); candidates.push(pd); }
        }
        if (candidates.length === 0) return <span className="text-gray-300 text-xs">-</span>;
        const end = candidates.reduce((a, b) => a < b ? a : b);
        const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
        const isPast = endStr < new Date().toISOString().slice(0, 10);
        return <span className={`text-xs ${isPast ? "text-red-400" : "text-gray-300"}`}>{endStr}</span>;
      },
    },
    {
      key: "conditions",
      label: "修了条件",
      width: 380,
      sortValue: (c) => {
        const d = completionData[c.id];
        const chk = checksData[c.id];
        return (d?.hasOutputForm ? 1 : 0) + (d?.caseConditionMet ? 1 : 0) + (d?.behaviorConditionMet ? 1 : 0) + (d?.hasPassingEvaluation ? 1 : 0) + ((chk?.identityDocVerified && chk?.bankDocVerified) ? 1 : 0);
      },
      render: (c) => {
        const d = completionData[c.id];
        const chk = checksData[c.id];
        const alerts = getAlerts(d);
        const conditions = [
          { met: d?.hasOutputForm || false, label: "教材" },
          { met: d?.caseConditionMet || false, label: "ケース面接" },
          { met: d?.behaviorConditionMet || false, label: "BH/追加指導" },
          { met: d?.hasPassingEvaluation || false, label: "総合評価" },
          { met: (chk?.identityDocVerified && chk?.bankDocVerified) || false, label: "目視確認" },
        ];
        return (
          <div className="flex items-center gap-1.5">
            {conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-0.5">
                <span
                  className={`w-3.5 h-3.5 flex items-center justify-center rounded text-[8px] font-bold ${
                    cond.met ? "bg-green-600 text-white" : "bg-gray-700 text-gray-500"
                  }`}
                >
                  {cond.met ? "✓" : "✗"}
                </span>
                <span className={`text-[10px] ${cond.met ? "text-green-400" : "text-gray-500"}`}>
                  {cond.label}
                </span>
              </div>
            ))}
            {alerts.length > 0 && (
              <span className="text-amber-400 text-[10px] ml-0.5" title={alerts.join(", ")}>⚠️</span>
            )}
          </div>
        );
      },
    },
    {
      key: "case_sessions",
      label: "ケース",
      width: 70,
      sortValue: (c) => completionData[c.id]?.caseSessionCount || 0,
      render: (c) => {
        const d = completionData[c.id];
        const count = d?.caseSessionCount || 0;
        return (
          <div className="flex items-center gap-0.5" title={`${count}/4回${d?.caseConditionViaOr ? " (OR条件)" : ""}`}>
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={`w-3.5 h-3.5 rounded-full border ${
                  n <= count
                    ? "bg-green-500 border-green-400"
                    : "bg-gray-700/50 border-gray-600"
                }`}
              />
            ))}
            {d?.caseConditionViaOr && <span className="text-amber-400 text-[9px] ml-0.5">!</span>}
          </div>
        );
      },
    },
    {
      key: "behavior_sessions",
      label: "Behavior",
      width: 50,
      sortValue: (c) => completionData[c.id]?.behaviorSessionCount || 0,
      render: (c) => {
        const d = completionData[c.id];
        const count = d?.behaviorSessionCount || 0;
        return (
          <div className="flex items-center" title={`ビヘイビア ${count}/1回`}>
            <span
              className={`w-3.5 h-3.5 rounded-full border ${
                count >= 1
                  ? "bg-green-500 border-green-400"
                  : "bg-gray-700/50 border-gray-600"
              }`}
            />
          </div>
        );
      },
    },
    {
      key: "additional_coaching",
      label: "追加指導",
      width: 50,
      sortValue: (c) => completionData[c.id]?.additionalCoachingCount || 0,
      render: (c) => {
        const d = completionData[c.id];
        const count = d?.additionalCoachingCount || 0;
        return (
          <div className="flex items-center" title={`追加指導 ${count}回`}>
            <span
              className={`w-3.5 h-3.5 rounded-full border ${
                count >= 1
                  ? "bg-green-500 border-green-400"
                  : "bg-gray-700/50 border-gray-600"
              }`}
            />
          </div>
        );
      },
    },
    {
      key: "documents",
      label: "書類提出",
      width: 70,
      sortValue: (c) => { const d = completionData[c.id]; return (d?.identityDocUrl ? 1 : 0) + (d?.bankDocUrl ? 1 : 0); },
      render: (c) => {
        const d = completionData[c.id];
        return (
          <div className="flex gap-1">
            <span title="本人確認書類" className={`text-[10px] ${d?.identityDocUrl ? "text-green-400" : "text-red-400"}`}>
              {d?.identityDocUrl ? "✅" : "❌"}ID
            </span>
            <span title="振込先書類" className={`text-[10px] ${d?.bankDocUrl ? "text-green-400" : "text-red-400"}`}>
              {d?.bankDocUrl ? "✅" : "❌"}口
            </span>
          </div>
        );
      },
    },
    {
      key: "doc_verified",
      label: "目視確認",
      width: 90,
      sortValue: (c) => { const chk = checksData[c.id]; return (chk?.identityDocVerified ? 1 : 0) + (chk?.bankDocVerified ? 1 : 0); },
      render: (c) => {
        const chk = checksData[c.id];
        return (
          <div className="flex gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCheck(c.id, "identity_doc_verified"); }}
              title="本人確認書類 目視確認"
              className={`text-[10px] px-1 py-0.5 rounded border transition-colors ${
                chk?.identityDocVerified
                  ? "bg-green-900/40 text-green-300 border-green-500/30"
                  : "bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-400"
              }`}
            >
              {chk?.identityDocVerified ? "✓" : "○"}ID
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCheck(c.id, "bank_doc_verified"); }}
              title="振込先書類 目視確認"
              className={`text-[10px] px-1 py-0.5 rounded border transition-colors ${
                chk?.bankDocVerified
                  ? "bg-green-900/40 text-green-300 border-green-500/30"
                  : "bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-400"
              }`}
            >
              {chk?.bankDocVerified ? "✓" : "○"}口
            </button>
          </div>
        );
      },
    },
    {
      key: "issued",
      label: "発行済み",
      width: 90,
      sortValue: (c) => { const docs = documentData[c.id]; return (docs?.invoiceIssuedAt ? 1 : 0) + (docs?.receiptIssuedAt ? 1 : 0) + (docs?.certificateIssuedAt ? 1 : 0); },
      render: (c) => {
        const docs = documentData[c.id];
        if (!docs) return <span className="text-xs text-gray-600">-</span>;
        return (
          <div className="flex gap-1">
            {docs.invoiceIssuedAt && <span className="text-[9px] bg-blue-900/40 text-blue-300 px-1 rounded">請求</span>}
            {docs.receiptIssuedAt && <span className="text-[9px] bg-purple-900/40 text-purple-300 px-1 rounded">領収</span>}
            {docs.certificateIssuedAt && <span className="text-[9px] bg-green-900/40 text-green-300 px-1 rounded">修了</span>}
            {!docs.invoiceIssuedAt && !docs.receiptIssuedAt && !docs.certificateIssuedAt && (
              <span className="text-xs text-gray-600">-</span>
            )}
          </div>
        );
      },
    },
    {
      key: "confirmed_amount",
      label: "確定売上",
      width: 110,
      sortValue: (c) => (c.contract?.confirmed_amount || 0) + (c.contract?.subsidy_eligible ? 203636 : 0),
      render: (c) => {
        if (!c.contract?.confirmed_amount) return <span className="text-gray-300 text-xs">-</span>;
        const base = c.contract.confirmed_amount;
        const subsidy = c.contract.subsidy_eligible ? RESKILLING_UNIT : 0;
        const total = base + subsidy;
        return (
          <span className="text-gray-300 text-xs" title={`受講料 ${formatCurrency(base)}${subsidy ? ` + 補助金 ${formatCurrency(subsidy)}` : ""}`}>
            {formatCurrency(total)}
          </span>
        );
      },
    },
  ];
}

// ================================================================
// Main Component
// ================================================================

type TabKey = "list" | "weekly" | "monthly";
type DrillMetric = "collected" | "supported" | "courseStarted";

interface WeeklyStats {
  weekEnd: string;
  label: string;
  collected: number;
  supported: number;
  courseStarted: number;
}

interface MonthlyStats {
  month: string;
  label: string;
  courseStarted: number;
  reskillingExpense: number;
}

interface DrillState {
  weekEnd: string;
  label: string;
  metric: DrillMetric;
}

const METRIC_LABELS: Record<DrillMetric, string> = {
  collected: "集客人数",
  supported: "支援開始人数",
  courseStarted: "講座受講開始人数",
};

export function SubsidyClient({ customers, firstPaidMap, completionData, documentData, checksData: initialChecksData }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("list");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithRelations | null>(null);
  const [docModal, setDocModal] = useState<DocModalState>({ open: false, type: "invoice", customer: null, completion: null });
  const [checksData, setChecksData] = useState(initialChecksData);
  const [drill, setDrill] = useState<DrillState | null>(null);

  const weekEnds = useMemo(() => generateWeekEnds(), []);
  const months = useMemo(() => generateMonths(), []);

  const subsidyCustomers = useMemo(() => customers.filter(isSubsidyTarget), [customers]);

  const handleToggleCheck = useCallback(async (customerId: string, field: "identity_doc_verified" | "bank_doc_verified") => {
    try {
      const res = await fetch("/api/subsidy/update-check", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, field }),
      });
      if (res.ok) {
        const data = await res.json();
        setChecksData((prev) => ({
          ...prev,
          [customerId]: {
            ...prev[customerId],
            [field === "identity_doc_verified" ? "identityDocVerified" : "bankDocVerified"]: data[field],
          },
        }));
      }
    } catch (e) {
      console.error("Toggle check failed:", e);
    }
  }, []);

  const columns = useMemo(
    () => buildColumns(firstPaidMap, completionData, documentData, checksData, setSelectedCustomer, handleToggleCheck),
    [firstPaidMap, completionData, documentData, checksData, handleToggleCheck]
  );

  // Summary stats
  const alertCount = useMemo(() => {
    return subsidyCustomers.filter((c) => getAlerts(completionData[c.id]).length > 0).length;
  }, [subsidyCustomers, completionData]);

  const completedCount = useMemo(() => {
    return subsidyCustomers.filter((c) => {
      const { met, total } = getConditionScore(completionData[c.id], checksData[c.id]);
      return met === total;
    }).length;
  }, [subsidyCustomers, completionData, checksData]);

  // 推移用の対象者（元の日付ベース定義）
  const collectionTargets = useMemo(() => customers.filter(isSubsidyCollectionTarget), [customers]);

  // Weekly stats — 推移は日付ベース定義（対象者リストのみsubsidyCustomers）
  const weeklyStats: WeeklyStats[] = useMemo(() => {
    return weekEnds.map((weekEnd) => {
      // 集客人数 = 既卒で交付決定日以降に申し込みまたは営業実施
      const collected = collectionTargets.filter((c) => {
        const d = getSubsidyDate(c);
        return d > SUBSIDY_START && d <= weekEnd;
      }).length;
      // 支援開始人数 = 営業実施日ベース（日程未確/未実施以外）
      const supported = collectionTargets.filter((c) => {
        if (!isSupportStarted(c)) return false;
        const d = normalizeDate(c.pipeline?.sales_date);
        return d > SUBSIDY_START && d <= weekEnd;
      }).length;
      // 講座受講開始人数 = 成約かつ支払い済み
      const courseStarted = collectionTargets.filter((c) => {
        if (!isCourseStarted(c)) return false;
        const d = normalizeDate(firstPaidMap[c.id]) || normalizeDate(c.contract?.payment_date) || normalizeDate(c.pipeline?.sales_date);
        return d > SUBSIDY_START && d <= weekEnd;
      }).length;
      return { weekEnd, label: formatWeekLabel(weekEnd), collected, supported, courseStarted };
    });
  }, [weekEnds, collectionTargets, firstPaidMap]);

  const monthlyStats: MonthlyStats[] = useMemo(() => {
    return months.map((month) => {
      const courseStarted = collectionTargets.filter((c) => {
        if (!isCourseStarted(c)) return false;
        const d = normalizeDate(firstPaidMap[c.id]) || normalizeDate(c.contract?.payment_date) || normalizeDate(c.pipeline?.sales_date);
        return d.startsWith(month);
      }).length;
      return { month, label: formatMonthLabel(month), courseStarted, reskillingExpense: courseStarted * RESKILLING_UNIT };
    });
  }, [months, customers, firstPaidMap]);

  const monthlyTotal = useMemo(() => monthlyStats.reduce((s, m) => s + m.reskillingExpense, 0), [monthlyStats]);
  const latest = weeklyStats[weeklyStats.length - 1];

  // ドリルダウン: 該当顧客リスト
  const drillCustomers = useMemo(() => {
    if (!drill) return [];
    const { weekEnd, metric } = drill;
    if (metric === "collected") {
      return collectionTargets.filter((c) => {
        const d = getSubsidyDate(c);
        return d > SUBSIDY_START && d <= weekEnd;
      });
    }
    if (metric === "supported") {
      return collectionTargets.filter((c) => {
        if (!isSupportStarted(c)) return false;
        const d = normalizeDate(c.pipeline?.sales_date);
        return d > SUBSIDY_START && d <= weekEnd;
      });
    }
    // courseStarted
    return collectionTargets.filter((c) => {
      if (!isCourseStarted(c)) return false;
      const d = normalizeDate(firstPaidMap[c.id]) || normalizeDate(c.contract?.payment_date) || normalizeDate(c.pipeline?.sales_date);
      return d > SUBSIDY_START && d <= weekEnd;
    });
  }, [drill, collectionTargets, firstPaidMap]);

  const handleOpenDoc = useCallback((type: DocType) => {
    if (!selectedCustomer) return;
    setDocModal({
      open: true,
      type,
      customer: selectedCustomer,
      completion: completionData[selectedCustomer.id] || null,
    });
  }, [selectedCustomer, completionData]);

  return (
    <div className="min-h-screen bg-surface-base p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">補助金</h1>
            <p className="text-gray-400 text-sm mt-1">リスキリング補助金 管理（2026/2/10〜）</p>
          </div>
          <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5 border border-white/10">
            {([
              { key: "list" as TabKey, label: "対象者リスト" },
              { key: "weekly" as TabKey, label: "週次推移" },
              { key: "monthly" as TabKey, label: "月次推移" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-brand text-white shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        {latest && (
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-surface-card border border-white/10 rounded-xl p-4">
              <p className="text-[10px] text-gray-500">集客人数</p>
              <p className="text-2xl font-bold text-blue-400 mt-0.5">{latest.collected}<span className="text-sm text-gray-400 ml-1">人</span></p>
            </div>
            <div className="bg-surface-card border border-white/10 rounded-xl p-4">
              <p className="text-[10px] text-gray-500">支援開始</p>
              <p className="text-2xl font-bold text-green-400 mt-0.5">{latest.supported}<span className="text-sm text-gray-400 ml-1">人</span></p>
            </div>
            <div className="bg-surface-card border border-white/10 rounded-xl p-4">
              <p className="text-[10px] text-gray-500">受講開始</p>
              <p className="text-2xl font-bold text-purple-400 mt-0.5">{latest.courseStarted}<span className="text-sm text-gray-400 ml-1">人</span></p>
            </div>
            <div className="bg-surface-card border border-white/10 rounded-xl p-4">
              <p className="text-[10px] text-gray-500">修了条件達成</p>
              <p className="text-2xl font-bold text-emerald-400 mt-0.5">{completedCount}<span className="text-sm text-gray-400 ml-1">人</span></p>
            </div>
            <div className={`bg-surface-card border rounded-xl p-4 ${alertCount > 0 ? "border-amber-500/30" : "border-white/10"}`}>
              <p className="text-[10px] text-gray-500">進捗アラート</p>
              <p className={`text-2xl font-bold mt-0.5 ${alertCount > 0 ? "text-amber-400" : "text-gray-600"}`}>
                {alertCount}<span className="text-sm text-gray-400 ml-1">件</span>
              </p>
            </div>
          </div>
        )}

        {/* Weekly */}
        {activeTab === "weekly" && (
          <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">週次推移</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-6 py-3 text-gray-400 font-medium">期間</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">集客人数</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">支援開始人数</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">講座受講開始人数</th>
                  </tr>
                </thead>
                <tbody>
                  {[...weeklyStats].reverse().map((w) => (
                    <tr key={w.weekEnd} className="border-b border-white/5">
                      <td className="px-6 py-3 text-gray-300 font-medium whitespace-nowrap">{w.label}</td>
                      {(["collected", "supported", "courseStarted"] as DrillMetric[]).map((m) => (
                        <td key={m} className="text-center px-4 py-3">
                          <button
                            onClick={() => setDrill({ weekEnd: w.weekEnd, label: w.label, metric: m })}
                            className="text-white font-semibold hover:text-blue-400 hover:underline transition-colors"
                          >
                            {w[m]}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Monthly */}
        {activeTab === "monthly" && (
          <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">月次推移</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-6 py-3 text-gray-400 font-medium">月</th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">講座受講開始人数</th>
                    <th className="text-right px-6 py-3 text-gray-400 font-medium whitespace-nowrap">リスキリング経費</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthlyStats].reverse().map((m) => (
                    <tr key={m.month} className="border-b border-white/5">
                      <td className="px-6 py-3 text-gray-300 font-medium">{m.label}</td>
                      <td className="text-center px-4 py-3 text-white font-semibold">{m.courseStarted}人</td>
                      <td className="text-right px-6 py-3 text-white font-semibold">{formatCurrency(m.reskillingExpense)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/10 bg-white/5">
                    <td className="px-6 py-3 text-gray-200 font-bold">合計</td>
                    <td className="text-center px-4 py-3 text-white font-bold">
                      {monthlyStats.reduce((s, m) => s + m.courseStarted, 0)}人
                    </td>
                    <td className="text-right px-6 py-3 text-white font-bold">{formatCurrency(monthlyTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Customer List */}
        {activeTab === "list" && (
          <SpreadsheetTable
            columns={columns}
            data={subsidyCustomers}
            getRowKey={(c) => c.id}
            storageKey="subsidy-list-v2"
            pageSize={100}
          />
        )}
      </div>

      {/* Detail Modal */}
      {selectedCustomer && !docModal.open && (
        <CustomerDetailModal
          customer={selectedCustomer}
          completion={completionData[selectedCustomer.id]}
          documents={documentData[selectedCustomer.id]}
          checks={checksData[selectedCustomer.id]}
          onClose={() => setSelectedCustomer(null)}
          onOpenDoc={handleOpenDoc}
          onToggleCheck={(field) => handleToggleCheck(selectedCustomer.id, field)}
        />
      )}

      {/* Document Modal */}
      <DocumentModal
        state={docModal}
        onClose={() => setDocModal({ open: false, type: "invoice", customer: null, completion: null })}
        firstPaidMap={firstPaidMap}
      />

      {/* Drill-down Modal */}
      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDrill(null)}>
          <div className="bg-surface-card border border-white/10 rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">{METRIC_LABELS[drill.metric]}</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">{drill.label}時点 — {drillCustomers.length}人</p>
              </div>
              <button onClick={() => setDrill(null)} className="text-gray-400 hover:text-white text-lg">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {drillCustomers.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">該当なし</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-card">
                    <tr className="border-b border-white/10 text-gray-400">
                      <th className="text-left py-2 px-3">名前</th>
                      <th className="text-left py-2 px-3">属性</th>
                      <th className="text-left py-2 px-3">ステージ</th>
                      <th className="text-left py-2 px-3">
                        {drill.metric === "collected" ? "申込/営業日" : drill.metric === "supported" ? "営業実施日" : "入金日"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillCustomers.map((c) => {
                      const dateStr = drill.metric === "collected"
                        ? getSubsidyDate(c)
                        : drill.metric === "supported"
                          ? normalizeDate(c.pipeline?.sales_date)
                          : normalizeDate(firstPaidMap[c.id]) || normalizeDate(c.contract?.payment_date) || normalizeDate(c.pipeline?.sales_date);
                      return (
                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-2 px-3">
                            <Link href={`/customers/${c.id}`} className="text-blue-400 hover:underline">{c.name}</Link>
                          </td>
                          <td className="py-2 px-3 text-gray-300">{c.attribute || "—"}</td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${getStageColor(c.pipeline?.stage || "")}`}>
                              {c.pipeline?.stage || "—"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-300">{dateStr || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
