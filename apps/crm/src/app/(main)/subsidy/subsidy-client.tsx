"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
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
  assessmentCount: number;
  agentInterviewCount: number;
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
  invoiceSentAt: string | null;
  receiptIssuedAt: string | null;
  receiptSentAt: string | null;
  certificateIssuedAt: string | null;
  certificateSentAt: string | null;
  certificateNumber: string | null;
}

interface SubsidyCheckData {
  identityDocVerified: boolean;
  bankDocVerified: boolean;
  contractVerified: boolean;
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

function formatMMDD(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(normalizeDate(d) + "T00:00:00");
  if (isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateJP(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(normalizeDate(d) + "T00:00:00");
  if (isNaN(date.getTime())) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** テスト顧客判定: 名前に「テスト」を含む */
function isTestCustomer(c: CustomerWithRelations): boolean {
  const name = c.name || "";
  return name.includes("テスト");
}

/** 補助金対象判定（対象者リスト用）: contracts.subsidy_eligible=true かつ 成約済み */
function isSubsidyTarget(c: CustomerWithRelations): boolean {
  if (isTestCustomer(c)) return false;
  if (!c.contract?.subsidy_eligible) return false;
  if (c.pipeline?.stage !== "成約") return false;
  return true;
}

/** 補助金推移用の集客対象判定（元の日付ベース定義）:
 *  既卒で、申し込み日が2/10以降 OR 営業日が2/10以降（未実施/日程未確/NoShow除く） */
function isSubsidyCollectionTarget(c: CustomerWithRelations): boolean {
  if (isTestCustomer(c)) return false;
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

/** 修了条件の達成数を計算（7条件） */
function getConditionScore(
  d: SubsidyCompletionData | undefined,
  chk: SubsidyCheckData | undefined,
  docs?: DocumentData | undefined,
): { met: number; total: number } {
  if (!d) return { met: 0, total: 7 };
  let met = 0;
  if (d.hasOutputForm) met++;
  if (d.caseConditionMet) met++;
  if (d.behaviorConditionMet) met++;
  if (d.hasPassingEvaluation) met++;
  if (chk?.identityDocVerified && chk?.bankDocVerified) met++;
  if (chk?.contractVerified) met++;
  if (docs?.invoiceSentAt && docs?.receiptSentAt && docs?.certificateSentAt) met++;
  return { met, total: 7 };
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

function CertificatePreview({ customer, certNumber, startDate, endDate, issueDate }: {
  customer: CustomerWithRelations;
  certNumber: string;
  startDate: string;
  endDate: string;
  issueDate: string;
}) {
  return (
    <div className="bg-white text-black p-8 rounded-lg max-w-[600px] mx-auto text-sm leading-relaxed" id="doc-preview">
      <p className="text-right text-xs text-gray-500 mb-4">通し番号：{certNumber}</p>
      <p className="text-right text-xs text-gray-600 mb-2">{issueDate}</p>
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
  const today = new Date().toISOString().slice(0, 10);
  // 修了証明書: 受講開始日 = 回次1の初回指導日、発行日 = 今日
  const defaultStartDate = state.type === "certificate"
    ? normalizeDate(completion?.firstCoachingDate) || defaultPaymentDate
    : defaultPaymentDate;
  const [paymentDate, setPaymentDate] = useState(defaultPaymentDate);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [certNumber, setCertNumber] = useState(
    customer.contract?.subsidy_number ? String(customer.contract.subsidy_number) : "00001"
  );
  const [sendStep, setSendStep] = useState<"idle" | "confirm" | "sending" | "done">("idle");

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

  const handleSendConfirm = async () => {
    setSendStep("sending");
    try {
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
          sendEmail: !!customerEmail,
        }),
      });
      const data = await res.json();
      if (data.certificateNumber) setCertNumber(data.certificateNumber);
      setSendStep("done");
    } catch (e) {
      console.error("Send failed:", e);
      setSendStep("idle");
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
                {state.type === "invoice" ? "支払い通知日（入金日と同一）" : "発行日"}
              </label>
              {state.type === "invoice" ? (
                <p className="w-48 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white">
                  {paymentDate || "入金日未設定"}
                </p>
              ) : (
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-48 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white"
                />
              )}
            </div>
          )}
          {state.type === "certificate" && (
            <>
              <div>
                <label className="text-xs text-gray-400 block mb-1">発行日</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-48 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">受講開始日（回次1の初回指導日）</label>
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
                issueDate={formatDateJP(issueDate) || issueDate}
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
          <div className="flex gap-2 items-center">
            {sendStep === "idle" && (
              <>
                {!customerEmail && (
                  <span className="text-xs text-amber-400 mr-2">⚠ メール未登録</span>
                )}
                <button
                  onClick={() => setSendStep("confirm")}
                  disabled={!customerEmail}
                  className="px-5 py-2.5 text-sm bg-brand text-white rounded-lg hover:bg-brand/90 disabled:opacity-50 transition-colors font-medium"
                >
                  📧 PDFを送信
                </button>
              </>
            )}
            {sendStep === "confirm" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-amber-300">本当に {customerEmail} に送信しますか？</span>
                <button
                  onClick={handleSendConfirm}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors font-bold"
                >
                  送信する
                </button>
                <button
                  onClick={() => setSendStep("idle")}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-white border border-white/10 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
              </div>
            )}
            {sendStep === "sending" && (
              <span className="flex items-center gap-2 text-sm text-blue-400 font-medium">
                <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                送信中...
              </span>
            )}
            {sendStep === "done" && (
              <span className="flex items-center gap-2 text-sm text-green-400 font-medium">
                ✅ メールが送信されました（{customerEmail}）
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// Training Record Panel (受講記録)
// ================================================================

interface TrainingRecordData {
  customer: { id: string; name: string; attribute: string; planName: string; enrollmentDate: string | null };
  careerConsultations: { number: number; date: string; counselor: string; type: string; rawData: Record<string, string> }[];
  caseCoachings: { number: number; date: string; mentor: string; evaluation: string | null; topic: string; goodPoints: string; improvements: string; rawData: Record<string, string> }[];
  materialSubmission: { submitted: boolean; date: string | null };
  completionConditions: {
    caseCoachingMet: boolean; caseCoachingCount: number;
    careerConsultationMet: boolean; careerConsultationCount: number;
    materialMet: boolean; evaluationMet: boolean; bestEvaluation: string | null;
    allMet: boolean; completionDate: string | null;
  };
}

function TrainingRecordPanel({ customerId }: { customerId: string }) {
  const [data, setData] = useState<TrainingRecordData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    if (data) { setExpanded((v) => !v); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/subsidy/training-record?customerId=${customerId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setExpanded(true);
      }
    } catch (e) {
      console.error("Failed to fetch training record:", e);
    } finally {
      setLoading(false);
    }
  }, [customerId, data]);

  const handlePrint = useCallback(() => {
    const el = document.getElementById("training-record-content");
    if (!el) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>受講記録 - ${data?.customer.name}</title>
      <style>
        body { font-family: 'Hiragino Kaku Gothic Pro', 'Yu Gothic', sans-serif; padding: 30px; color: #222; }
        h1 { font-size: 18px; text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; }
        h2 { font-size: 14px; margin-top: 24px; border-left: 4px solid #A62B17; padding-left: 8px; }
        .condition { display: flex; align-items: center; gap: 6px; margin: 4px 0; font-size: 12px; }
        .check { width: 14px; height: 14px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; color: white; }
        .check-ok { background: #16a34a; }
        .check-ng { background: #dc2626; }
        .session { border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin: 8px 0; font-size: 12px; }
        .session-header { display: flex; gap: 16px; margin-bottom: 6px; }
        .session-label { color: #666; font-size: 11px; }
        .eval-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; }
        .eval-pass { background: #dcfce7; color: #166534; }
        .eval-fail { background: #fee2e2; color: #991b1b; }
        @media print { body { padding: 20px; } }
      </style></head>
      <body>${el.innerHTML}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }, [data]);

  return (
    <div className="border-t border-white/10">
      <button
        onClick={fetchData}
        disabled={loading}
        className="w-full px-6 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">受講記録</span>
          {loading && <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
        </div>
        <span className={`text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
      </button>

      {expanded && data && (
        <div className="px-6 pb-4">
          <div className="flex justify-end mb-3">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs bg-brand/20 text-brand border border-brand/30 rounded-lg hover:bg-brand/30 transition-colors"
            >
              PDF出力 / 印刷
            </button>
          </div>

          <div id="training-record-content">
            {/* 修了条件チェック */}
            <div className="mb-4 p-4 rounded-lg border border-white/10 bg-surface-elevated">
              <h3 className="text-xs font-bold text-white mb-3">修了条件チェック</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${data.completionConditions.caseCoachingMet ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                    {data.completionConditions.caseCoachingMet ? "✓" : "✗"}
                  </span>
                  <span className={`text-xs ${data.completionConditions.caseCoachingMet ? "text-green-400" : "text-red-400"}`}>
                    ケース指導 4回以上（実績: {data.completionConditions.caseCoachingCount}回）
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${data.completionConditions.careerConsultationMet ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                    {data.completionConditions.careerConsultationMet ? "✓" : "✗"}
                  </span>
                  <span className={`text-xs ${data.completionConditions.careerConsultationMet ? "text-green-400" : "text-red-400"}`}>
                    キャリア相談 2回以上（実績: {data.completionConditions.careerConsultationCount}回）
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${data.completionConditions.materialMet ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                    {data.completionConditions.materialMet ? "✓" : "✗"}
                  </span>
                  <span className={`text-xs ${data.completionConditions.materialMet ? "text-green-400" : "text-red-400"}`}>
                    教材閲覧完了{data.materialSubmission.date ? `（提出日: ${data.materialSubmission.date}）` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${data.completionConditions.evaluationMet ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                    {data.completionConditions.evaluationMet ? "✓" : "✗"}
                  </span>
                  <span className={`text-xs ${data.completionConditions.evaluationMet ? "text-green-400" : "text-red-400"}`}>
                    ケース指導評価が内定獲得圏内レベル以上{data.completionConditions.bestEvaluation ? `（${data.completionConditions.bestEvaluation}）` : ""}
                  </span>
                </div>
              </div>
              {data.completionConditions.allMet && data.completionConditions.completionDate && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs text-green-400 font-semibold">修了日: {data.completionConditions.completionDate}</p>
                </div>
              )}
            </div>

            {/* キャリア相談記録 */}
            <div className="mb-4">
              <h3 className="text-xs font-bold text-white mb-2">キャリア相談記録（{data.careerConsultations.length}/2回）</h3>
              <div className="space-y-2">
                {data.careerConsultations.map((cc) => (
                  <div key={cc.number} className="p-3 rounded-lg border border-white/10 bg-surface-elevated">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold text-white">第{cc.number}回</span>
                      <span className="text-[10px] text-gray-400">{cc.date}</span>
                      <span className="text-[10px] text-gray-400">担当: {cc.counselor || "—"}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">{cc.type}</span>
                    </div>
                    <div className="text-xs text-gray-300 leading-relaxed">
                      {cc.type === "初回キャリア面談" ? (
                        <div>
                          <p>これまでのキャリアの棚卸し・伝え方の整理を実施。</p>
                          <p>今後のキャリアゴールの確認・志望動機の整理を行った。</p>
                          <p>コンサルタントとしてのスキル・適性確認、強みやアピールポイントの整理を実施。</p>
                          <p>リスキリング講座受講の検討を行い、入塾を決定。</p>
                          {cc.rawData["結果"] && <p className="mt-1 text-gray-400">結果: {cc.rawData["結果"]}</p>}
                        </div>
                      ) : (
                        <div>
                          <p>受講進捗の確認を実施。</p>
                          <p>これまでのキャリアの棚卸し・伝え方の整理、今後のキャリアゴールの確認・志望動機の整理を行った。</p>
                          <p>コンサルタントとしてのスキル・適性確認、強みやアピールポイントの整理を実施。</p>
                          {cc.rawData["面談内の実施内容"] && <p className="mt-1 text-gray-400">実施内容: {cc.rawData["面談内の実施内容"]}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ケース面接指導記録 */}
            <div className="mb-4">
              <h3 className="text-xs font-bold text-white mb-2">ケース面接指導記録（{data.caseCoachings.length}/4回）</h3>
              <div className="space-y-2">
                {data.caseCoachings.map((cc) => (
                  <div key={cc.number} className="p-3 rounded-lg border border-white/10 bg-surface-elevated">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold text-white">第{cc.number}回</span>
                      <span className="text-[10px] text-gray-400">{cc.date}</span>
                      <span className="text-[10px] text-gray-400">担当: {cc.mentor}</span>
                      {cc.evaluation && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          cc.evaluation.includes("不可") ? "bg-red-900/40 text-red-300" : "bg-green-900/40 text-green-300"
                        }`}>
                          {cc.evaluation}
                        </span>
                      )}
                    </div>
                    {cc.topic && (
                      <p className="text-xs text-gray-300 mb-1">
                        <span className="text-gray-500">題材:</span> {cc.topic}
                      </p>
                    )}
                    {cc.goodPoints && (
                      <p className="text-xs text-gray-300 mb-1">
                        <span className="text-gray-500">よかった点:</span> {cc.goodPoints}
                      </p>
                    )}
                    {cc.improvements && (
                      <p className="text-xs text-gray-300">
                        <span className="text-gray-500">課題・改善点:</span> {cc.improvements}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 教材学習記録 */}
            <div className="mb-2">
              <h3 className="text-xs font-bold text-white mb-2">教材学習記録</h3>
              <div className="p-3 rounded-lg border border-white/10 bg-surface-elevated">
                <p className="text-xs text-gray-300">
                  {data.materialSubmission.submitted
                    ? `提出済み（提出日: ${data.materialSubmission.date || "—"}）`
                    : "未提出"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
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
  onToggleCheck?: (field: "identity_doc_verified" | "bank_doc_verified" | "contract_verified") => void;
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

            {/* Condition 3: ビヘイビア OR 追加指導 OR エージェント面談 */}
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
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-300">アセスメント</span>
                <span
                  className={`w-4 h-4 rounded-full border-2 ${
                    (d?.assessmentCount || 0) >= 1
                      ? "bg-green-500 border-green-400"
                      : "bg-transparent border-gray-600"
                  }`}
                />
                <span className="text-[10px] text-gray-500">{d?.assessmentCount || 0}回</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-300">Agent面談</span>
                <span
                  className={`w-4 h-4 rounded-full border-2 ${
                    (d?.agentInterviewCount || 0) >= 1
                      ? "bg-green-500 border-green-400"
                      : "bg-transparent border-gray-600"
                  }`}
                />
                <span className="text-[10px] text-gray-500">{d?.agentInterviewCount || 0}回</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">いずれか1回以上で条件達成</p>
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

            {/* Condition 5: 書類目視確認（提出書類の確認・目視チェック統合） */}
            <div className={`p-3 rounded-lg border ${
              checks?.identityDocVerified && checks?.bankDocVerified
                ? "border-green-500/30 bg-green-900/10"
                : "border-red-500/30 bg-red-900/10"
            }`}>
              <ConditionBadge label="書類目視確認" met={(checks?.identityDocVerified && checks?.bankDocVerified) || false} />
              <p className="text-[10px] text-gray-500 mt-1">本人確認書類・振込先書類の両方を目視確認</p>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] ${checks?.identityDocVerified ? "text-green-400" : d?.identityDocUrl ? "text-amber-400" : "text-red-400"}`}>
                      {checks?.identityDocVerified ? "✅" : d?.identityDocUrl ? "📎" : "❌"} ID
                    </span>
                    {d?.identityDocUrl && (
                      <a href={d.identityDocUrl.split(",")[0].trim()} target="_blank" rel="noopener" className="text-[9px] text-brand hover:underline">確認</a>
                    )}
                  </div>
                  {checks && (
                    <button
                      onClick={() => onToggleCheck?.("identity_doc_verified")}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                        checks.identityDocVerified
                          ? "bg-green-900/40 text-green-300 border-green-500/30"
                          : "bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-400"
                      }`}
                    >
                      {checks.identityDocVerified ? "✓ 確認済" : "未確認"}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] ${checks?.bankDocVerified ? "text-green-400" : d?.bankDocUrl ? "text-amber-400" : "text-red-400"}`}>
                      {checks?.bankDocVerified ? "✅" : d?.bankDocUrl ? "📎" : "❌"} 口座
                    </span>
                    {d?.bankDocUrl && (
                      <a href={d.bankDocUrl.split(",")[0].trim()} target="_blank" rel="noopener" className="text-[9px] text-brand hover:underline">確認</a>
                    )}
                  </div>
                  {checks && (
                    <button
                      onClick={() => onToggleCheck?.("bank_doc_verified")}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                        checks.bankDocVerified
                          ? "bg-green-900/40 text-green-300 border-green-500/30"
                          : "bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-400"
                      }`}
                    >
                      {checks.bankDocVerified ? "✓ 確認済" : "未確認"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Condition 6: 契約書締結 */}
            <div className={`p-3 rounded-lg border ${checks?.contractVerified ? "border-green-500/30 bg-green-900/10" : "border-red-500/30 bg-red-900/10"}`}>
              <ConditionBadge label="契約書締結" met={checks?.contractVerified || false} />
              <p className="text-[10px] text-gray-500 mt-1">契約書への署名確認</p>
              {d?.contractSigned && <p className="text-[10px] text-amber-400 mt-1">📋 自己申告済</p>}
              <div className="mt-1.5">
                {checks && (
                  <button
                    onClick={() => onToggleCheck?.("contract_verified")}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                      checks.contractVerified
                        ? "bg-green-900/40 text-green-300 border-green-500/30"
                        : "bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {checks.contractVerified ? "✓ 確認済" : "未確認"}
                  </button>
                )}
              </div>
            </div>

            {/* Condition 7: 書類送付 */}
            {(() => {
              const allSent = !!(documents?.invoiceSentAt && documents?.receiptSentAt && documents?.certificateSentAt);
              return (
                <div className={`p-3 rounded-lg border ${allSent ? "border-green-500/30 bg-green-900/10" : "border-red-500/30 bg-red-900/10"}`}>
                  <ConditionBadge label="書類送付" met={allSent} />
                  <p className="text-[10px] text-gray-500 mt-1">請求書・領収書・修了証を全て送付</p>
                  <div className="mt-1 flex gap-1.5">
                    <span className={`text-[9px] px-1 py-0.5 rounded ${documents?.invoiceSentAt ? "bg-green-900/40 text-green-300" : documents?.invoiceIssuedAt ? "bg-amber-900/40 text-amber-300" : "bg-red-900/40 text-red-300"}`}>
                      {documents?.invoiceSentAt ? "📧" : documents?.invoiceIssuedAt ? "⚠" : "✗"} 請求
                    </span>
                    <span className={`text-[9px] px-1 py-0.5 rounded ${documents?.receiptSentAt ? "bg-green-900/40 text-green-300" : documents?.receiptIssuedAt ? "bg-amber-900/40 text-amber-300" : "bg-red-900/40 text-red-300"}`}>
                      {documents?.receiptSentAt ? "📧" : documents?.receiptIssuedAt ? "⚠" : "✗"} 領収
                    </span>
                    <span className={`text-[9px] px-1 py-0.5 rounded ${documents?.certificateSentAt ? "bg-green-900/40 text-green-300" : documents?.certificateIssuedAt ? "bg-amber-900/40 text-amber-300" : "bg-red-900/40 text-red-300"}`}>
                      {documents?.certificateSentAt ? "📧" : documents?.certificateIssuedAt ? "⚠" : "✗"} 修了
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Training Record */}
        <TrainingRecordPanel customerId={customer.id} />

        {/* Document actions */}
        <div className="px-6 py-4 border-t border-white/10">
          <h4 className="text-sm font-bold text-white mb-3">書類発行</h4>
          <div className="grid grid-cols-3 gap-3">
            {([
              { type: "invoice" as const, icon: "\ud83d\udcc4", label: "請求書/明細書", desc: "入塾時に発行",
                sent: documents?.invoiceSentAt, issued: documents?.invoiceIssuedAt, extra: null },
              { type: "receipt" as const, icon: "\ud83e\uddfe", label: "領収書", desc: "書類目視確認後に発行",
                sent: documents?.receiptSentAt, issued: documents?.receiptIssuedAt, extra: null },
              { type: "certificate" as const, icon: "\ud83c\udf93", label: "修了証明書", desc: "修了条件達成後に発行",
                sent: documents?.certificateSentAt, issued: documents?.certificateIssuedAt,
                extra: documents?.certificateNumber ? `No.${documents.certificateNumber}` : null },
            ]).map((doc) => {
              const isDone = !!doc.sent || !!doc.issued;
              return (
                <button
                  key={doc.type}
                  onClick={() => onOpenDoc(doc.type)}
                  className={`p-4 rounded-lg border-2 transition-all text-left group cursor-pointer ${
                    isDone
                      ? "border-green-500/40 bg-green-900/20 hover:border-green-400/60"
                      : "border-dashed border-white/20 hover:border-brand/50 hover:bg-brand/5"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{doc.icon}</span>
                    <p className={`text-xs font-bold transition-colors ${
                      isDone ? "text-green-300" : "text-white group-hover:text-brand"
                    }`}>{doc.label}</p>
                  </div>
                  <p className="text-[10px] text-gray-500">{doc.desc}</p>
                  {isDone ? (
                    <p className="text-[10px] text-green-400 mt-2">
                      送付済み: {normalizeDate(doc.sent || doc.issued!)}{doc.extra ? ` (${doc.extra})` : ""}
                    </p>
                  ) : (
                    <p className="text-[10px] text-brand/60 mt-2 group-hover:text-brand">クリックして送付 →</p>
                  )}
                </button>
              );
            })}
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
  onToggleCheck: (customerId: string, field: "identity_doc_verified" | "bank_doc_verified" | "contract_verified") => void,
): SpreadsheetColumn<CustomerWithRelations>[] {
  return [
    {
      key: "subsidy_id",
      label: "ID",
      width: 70,
      stickyLeft: 0,
      sortValue: (c) => c.contract?.subsidy_number || 999999,
      render: (c) => {
        const num = c.contract?.subsidy_number;
        return num ? (
          <span className="text-xs font-mono text-blue-300">{num}</span>
        ) : (
          <span className="text-xs text-gray-600">-</span>
        );
      },
    },
    {
      key: "name",
      label: "名前",
      width: 140,
      stickyLeft: 70,
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
      key: "first_coaching",
      label: "初回指導日",
      width: 100,
      sortValue: (c) => { const d = completionData[c.id]; return d?.firstCoachingDate ? normalizeDate(d.firstCoachingDate) : ""; },
      render: (c) => {
        const d = completionData[c.id];
        const dateStr = d?.firstCoachingDate ? formatMMDD(d.firstCoachingDate) : null;
        const payDate = paidMap[c.id] || c.contract?.payment_date || null;
        const warn = isTwoWeeksPastPayment(payDate, d?.firstCoachingDate);
        return (
          <span className={`text-xs ${warn ? "text-red-400 font-bold" : "text-gray-300"}`}>
            {dateStr || (warn ? "⚠️ 2週間超未予約" : "-")}
          </span>
        );
      },
    },
    {
      key: "payment_date",
      label: "入金日",
      width: 60,
      sortValue: (c) => paidMap[c.id] || c.contract?.payment_date || "",
      render: (c) => {
        const raw = paidMap[c.id] || c.contract?.payment_date || null;
        return <span className="text-gray-300 text-xs">{formatMMDD(raw) || "-"}</span>;
      },
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
        const payRaw = paidMap[c.id] || c.contract?.payment_date;
        if (payRaw) { const pd = new Date(normalizeDate(payRaw)); if (!isNaN(pd.getTime())) { pd.setMonth(pd.getMonth() + 3); candidates.push(pd); } }
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
        const payRaw = paidMap[c.id] || c.contract?.payment_date;
        if (payRaw) {
          const pd = new Date(normalizeDate(payRaw) + "T00:00:00");
          if (!isNaN(pd.getTime())) { pd.setMonth(pd.getMonth() + 3); candidates.push(pd); }
        }
        if (candidates.length === 0) return <span className="text-gray-300 text-xs">-</span>;
        const end = candidates.reduce((a, b) => a < b ? a : b);
        const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
        const isPast = endStr < new Date().toISOString().slice(0, 10);
        const displayStr = `${end.getMonth() + 1}/${end.getDate()}`;
        return <span className={`text-xs ${isPast ? "text-red-400" : "text-gray-300"}`}>{displayStr}</span>;
      },
    },
    {
      key: "conditions",
      label: "修了条件",
      width: 500,
      sortValue: (c) => {
        const d = completionData[c.id];
        const chk = checksData[c.id];
        const docs = documentData[c.id];
        return (d?.hasOutputForm ? 1 : 0) + (d?.caseConditionMet ? 1 : 0) + (d?.behaviorConditionMet ? 1 : 0) + (d?.hasPassingEvaluation ? 1 : 0) + ((chk?.identityDocVerified && chk?.bankDocVerified) ? 1 : 0) + (chk?.contractVerified ? 1 : 0) + ((docs?.invoiceSentAt && docs?.receiptSentAt && docs?.certificateSentAt) ? 1 : 0);
      },
      render: (c) => {
        const d = completionData[c.id];
        const chk = checksData[c.id];
        const docs = documentData[c.id];
        const alerts = getAlerts(d);
        const conditions = [
          { met: d?.hasOutputForm || false, label: "教材" },
          { met: d?.caseConditionMet || false, label: "ケース面接" },
          { met: d?.behaviorConditionMet || false, label: "BH/追加指導" },
          { met: d?.hasPassingEvaluation || false, label: "総合評価" },
          { met: (chk?.identityDocVerified && chk?.bankDocVerified) || false, label: "目視確認" },
          { met: chk?.contractVerified || false, label: "契約書" },
          { met: !!(docs?.invoiceSentAt && docs?.receiptSentAt && docs?.certificateSentAt), label: "書類送付" },
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
      key: "assessment",
      label: "アセスメント",
      width: 60,
      sortValue: (c) => completionData[c.id]?.assessmentCount || 0,
      render: (c) => {
        const d = completionData[c.id];
        const count = d?.assessmentCount || 0;
        return (
          <div className="flex items-center gap-0.5" title={`アセスメント ${count}/2回`}>
            {[1, 2].map((n) => (
              <span
                key={n}
                className={`w-3.5 h-3.5 rounded-full border ${
                  n <= count
                    ? "bg-green-500 border-green-400"
                    : "bg-gray-700/50 border-gray-600"
                }`}
              />
            ))}
          </div>
        );
      },
    },
    {
      key: "agent_interview",
      label: "Agent面談",
      width: 60,
      sortValue: (c) => completionData[c.id]?.agentInterviewCount || 0,
      render: (c) => {
        const d = completionData[c.id];
        const count = d?.agentInterviewCount || 0;
        return (
          <div className="flex items-center gap-0.5" title={`エージェント面談 ${count}/2回`}>
            {[1, 2].map((n) => (
              <span
                key={n}
                className={`w-3.5 h-3.5 rounded-full border ${
                  n <= count
                    ? "bg-green-500 border-green-400"
                    : "bg-gray-700/50 border-gray-600"
                }`}
              />
            ))}
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
      label: "送付状況",
      width: 100,
      sortValue: (c) => { const docs = documentData[c.id]; return (docs?.invoiceSentAt ? 2 : docs?.invoiceIssuedAt ? 1 : 0) + (docs?.receiptSentAt ? 2 : docs?.receiptIssuedAt ? 1 : 0) + (docs?.certificateSentAt ? 2 : docs?.certificateIssuedAt ? 1 : 0); },
      render: (c) => {
        const docs = documentData[c.id];
        if (!docs) return <span className="text-xs text-gray-600">-</span>;
        const items = [
          { label: "請求", sent: docs.invoiceSentAt, issued: docs.invoiceIssuedAt },
          { label: "領収", sent: docs.receiptSentAt, issued: docs.receiptIssuedAt },
          { label: "修了", sent: docs.certificateSentAt, issued: docs.certificateIssuedAt },
        ];
        const hasAny = items.some(i => i.sent || i.issued);
        if (!hasAny) return <span className="text-xs text-gray-600">-</span>;
        return (
          <div className="flex gap-1 flex-wrap">
            {items.map(i => i.sent ? (
              <span key={i.label} className="text-[9px] bg-green-900/40 text-green-300 px-1 rounded">📧{i.label}</span>
            ) : i.issued ? (
              <span key={i.label} className="text-[9px] bg-amber-900/40 text-amber-300 px-1 rounded">⚠{i.label}</span>
            ) : null)}
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
  const [assigningNumbers, setAssigningNumbers] = useState(false);

  const handleAssignNumbers = useCallback(async () => {
    setAssigningNumbers(true);
    try {
      const res = await fetch("/api/subsidy/assign-numbers", { method: "POST" });
      if (res.ok) {
        // ページをリロードして最新データを反映
        window.location.reload();
      }
    } catch (e) {
      console.error("Assign numbers failed:", e);
      setAssigningNumbers(false);
    }
  }, []);

  const weekEnds = useMemo(() => generateWeekEnds(), []);
  const months = useMemo(() => generateMonths(), []);

  const subsidyCustomers = useMemo(() => customers.filter(isSubsidyTarget), [customers]);

  const handleToggleCheck = useCallback(async (customerId: string, field: "identity_doc_verified" | "bank_doc_verified" | "contract_verified") => {
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
            [field === "identity_doc_verified" ? "identityDocVerified" : field === "bank_doc_verified" ? "bankDocVerified" : "contractVerified"]: data[field],
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
      const { met, total } = getConditionScore(completionData[c.id], checksData[c.id], documentData[c.id]);
      return met === total;
    }).length;
  }, [subsidyCustomers, completionData, checksData, documentData]);

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
      // 講座受講開始人数 = 成約かつ補助金対象
      const courseStarted = collectionTargets.filter((c) => {
        if (!isCourseStarted(c)) return false;
        if (!c.contract?.subsidy_eligible) return false;
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
        if (!c.contract?.subsidy_eligible) return false;
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
      if (!c.contract?.subsidy_eligible) return false;
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
          <>
            {/* 付番コントロール */}
            {(() => {
              const unassigned = subsidyCustomers.filter((c) => !c.contract?.subsidy_number).length;
              return (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">
                      対象者 <span className="text-white font-bold">{subsidyCustomers.length}</span>名
                      {unassigned > 0 && (
                        <span className="text-amber-400 ml-2">（未付番: {unassigned}名）</span>
                      )}
                    </span>
                  </div>
                  {unassigned > 0 && (
                    <button
                      onClick={handleAssignNumbers}
                      disabled={assigningNumbers}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors font-medium"
                    >
                      {assigningNumbers ? "付番中..." : `未付番 ${unassigned}名にID付与`}
                    </button>
                  )}
                </div>
              );
            })()}
            <SpreadsheetTable
              columns={columns}
              data={subsidyCustomers}
              getRowKey={(c) => c.id}
              storageKey="subsidy-list-v3"
              pageSize={100}
            />
          </>
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
