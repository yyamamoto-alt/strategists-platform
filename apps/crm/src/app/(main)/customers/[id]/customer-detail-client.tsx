"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  formatDate,
  formatCurrency,
  formatPercent,
  getStageColor,
  getAttributeColor,
} from "@/lib/utils";
import {
  calcSalesProjection,
  calcExpectedLTV,
  calcClosingProbability,
  calcExpectedReferralFee,
  calcAgentProjectedRevenue,
  calcConfirmedRevenue,
  calcRemainingSessions,
  calcSessionProgress,
  calcScheduleProgress,
  calcProgressStatus,
  isAgentConfirmed,
  getSubsidyAmount,
  getSchoolRevenue,
} from "@/lib/calc-fields";
import { useRouter } from "next/navigation";
import type { CustomerWithRelations, Activity, Order } from "@strategy-school/shared-db";
import type { CustomerEmail, ApplicationHistoryRecord } from "@/lib/data/spreadsheet-sync";
import type { MentorAssignment } from "@/lib/data/mentors";
import { useAuth } from "@/lib/auth-context";

// ================================================================
// データソースバッジ
// ================================================================

type DataSource = "manual" | "calc" | "sync";

const SOURCE_CONFIG: Record<DataSource, { label: string; cls: string; title: string }> = {
  manual: { label: "編集", cls: "text-blue-400 bg-blue-400/10 border-blue-400/20", title: "手動で編集可能" },
  calc: { label: "fx", cls: "text-amber-400 bg-amber-400/10 border-amber-400/20", title: "自動計算値" },
  sync: { label: "同期", cls: "text-green-400 bg-green-400/10 border-green-400/20", title: "フォーム同期で更新（手動編集可）" },
};

function SourceBadge({ source }: { source: DataSource }) {
  const { role } = useAuth();
  if (role !== "admin") return null;
  const cfg = SOURCE_CONFIG[source];
  return (
    <span
      className={`inline-flex items-center px-1 py-0 text-[9px] font-medium rounded border ${cfg.cls} ml-1`}
      title={cfg.title}
    >
      {cfg.label}
    </span>
  );
}

function SourceBadgeLegend() {
  const { role } = useAuth();
  if (role !== "admin") return null;
  return (
    <div className="hidden lg:flex items-center gap-3 text-[10px] text-gray-500">
      {(["manual", "calc", "sync"] as DataSource[]).map((s) => (
        <span key={s} className="flex items-center gap-1">
          <SourceBadge source={s} />
          {SOURCE_CONFIG[s].title.split("（")[0]}
        </span>
      ))}
    </div>
  );
}

// ================================================================
// フォームデータセクション
// ================================================================

// 1回限りフォーム（専用ボックスに常時展開）
const SINGLE_FORM_SOURCES = ["入塾フォーム", "営業報告"];

/** 1回限りフォーム: 常時展開のkey-valueテーブル */
function SingleFormSection({ title, record }: { title: string; record: ApplicationHistoryRecord }) {
  const rd = (record.raw_data || {}) as Record<string, string>;
  const entries = Object.entries(rd).filter(([, v]) => v);
  if (entries.length === 0) return null;

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {title}
        <span className="text-xs text-gray-500 ml-2 font-normal">{formatDate(record.applied_at)}</span>
        <SourceBadge source="sync" />
      </h2>
      <table className="w-full mt-3">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-b border-white/5 last:border-0">
              <td className="text-[10px] text-gray-500 py-1.5 pr-3 align-top whitespace-nowrap w-1/4">{k}</td>
              <td className="text-xs text-gray-300 py-1.5 break-words">
                {String(v).length > 300 ? String(v).substring(0, 300) + "…" : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** フォームソースに応じた最適な日付をraw_dataから取得 */
function getFormDisplayDate(record: ApplicationHistoryRecord): string | null {
  const rd = (record.raw_data || {}) as Record<string, string>;
  const source = record.source || "";

  // ソース別の日付フィールドマッピング
  const DATE_FIELD_MAP: Record<string, string[]> = {
    "メンター指導報告": ["指導日"],
    "営業報告": ["実施日"],
    "エージェント面談報告フォーム": ["実施日"],
    "カルテ": ["タイムスタンプ"],
    "課題提出": ["タイムスタンプ"],
    "面接終了後報告": ["タイムスタンプ"],
  };

  const fields = DATE_FIELD_MAP[source];
  if (fields) {
    for (const f of fields) {
      if (rd[f]) return rd[f];
    }
  }

  // フォールバック: raw_data内の汎用日付フィールドを探す
  for (const key of ["タイムスタンプ", "日付", "実施日", "指導日", "提出日"]) {
    if (rd[key]) return rd[key];
  }

  return null;
}

/** 繰り返しフォーム: タブ切替 + 折りたたみリスト */
function RepeatingFormSection({ records }: { records: ApplicationHistoryRecord[] }) {
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map: Record<string, ApplicationHistoryRecord[]> = {};
    for (const r of records) {
      const src = r.source || "その他";
      if (!map[src]) map[src] = [];
      map[src].push(r);
    }
    return map;
  }, [records]);

  const sources = Object.keys(grouped);
  const currentSource = activeSource || sources[0];
  const currentRecords = grouped[currentSource] || [];

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  if (sources.length === 0) return null;

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 border-l-2 border-l-gray-600 p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
        フォームデータ
        <span className="text-xs text-gray-500 ml-2 font-normal">{records.length}件</span>
        <SourceBadge source="sync" />
      </h2>

      <div className="flex flex-wrap gap-1 mb-4 mt-3">
        {sources.map((src) => (
          <button
            key={src}
            onClick={() => { setActiveSource(src); setExpandedIds(new Set()); }}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              currentSource === src
                ? "bg-brand text-white"
                : "bg-surface-elevated text-gray-400 hover:text-gray-300"
            }`}
          >
            {src.replace(/^LP申込\(/, "LP(")}{" "}
            <span className="opacity-60">{grouped[src].length}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {currentRecords.map((r) => {
          const rd = (r.raw_data || {}) as Record<string, string>;
          const isExpanded = expandedIds.has(r.id);
          const entries = Object.entries(rd).filter(([, v]) => v);
          // プレビュー: 最初の2フィールドだけ表示
          const preview = entries.slice(0, 2).map(([k, v]) => `${k}: ${String(v).substring(0, 40)}`).join(" / ");

          return (
            <div key={r.id} className="border border-white/5 rounded-lg bg-surface-elevated">
              <button
                onClick={() => toggleExpand(r.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="text-gray-500 text-xs w-4">{isExpanded ? "▾" : "▸"}</span>
                <span className="text-xs text-gray-400">{formatDate(getFormDisplayDate(r) || r.applied_at)}</span>
                {!isExpanded && (
                  <span className="text-[10px] text-gray-500 truncate">{preview}</span>
                )}
              </button>
              {isExpanded && (
                <div className="px-3 pb-3">
                  <table className="w-full">
                    <tbody>
                      {entries.map(([k, v]) => (
                        <tr key={k} className="border-b border-white/5 last:border-0">
                          <td className="text-[10px] text-gray-500 py-1 pr-3 align-top whitespace-nowrap w-1/4">{k}</td>
                          <td className="text-xs text-gray-300 py-1 break-words">
                            {String(v).length > 200 ? String(v).substring(0, 200) + "…" : String(v)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================================================================
// インライン編集フィールド
// ================================================================

interface FieldDef {
  key: string;
  label: string;
  source: DataSource;
  type?: "text" | "number" | "date" | "textarea" | "select" | "toggle";
  options?: string[];
  getValue: (c: CustomerWithRelations) => string;
  table?: "customer" | "pipeline" | "contract" | "learning" | "agent";
}

function InlineField({
  field,
  customer,
  isEditing,
  editValue,
  onEditChange,
}: {
  field: FieldDef;
  customer: CustomerWithRelations;
  isEditing: boolean;
  editValue: string;
  onEditChange: (key: string, value: string) => void;
}) {
  const displayValue = field.getValue(customer);
  const canEdit = isEditing && field.source === "manual" && field.table;
  const fieldType = field.type || "text";

  return (
    <div className="min-w-0">
      <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">
        {field.label}
        <SourceBadge source={field.source} />
      </p>
      {canEdit ? (
        fieldType === "toggle" ? (
          <button
            type="button"
            onClick={() => onEditChange(field.key, editValue === "true" ? "false" : "true")}
            className={`mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              editValue === "true" ? "bg-brand" : "bg-gray-600"
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              editValue === "true" ? "translate-x-6" : "translate-x-1"
            }`} />
          </button>
        ) : fieldType === "textarea" ? (
          <textarea
            value={editValue}
            onChange={(e) => onEditChange(field.key, e.target.value)}
            rows={2}
            className="w-full mt-0.5 px-2 py-1 bg-surface-elevated border border-brand/40 rounded text-sm text-white focus:outline-none focus:border-brand resize-none"
          />
        ) : fieldType === "select" && field.options ? (
          <select
            value={editValue}
            onChange={(e) => onEditChange(field.key, e.target.value)}
            className="w-full mt-0.5 px-2 py-1 bg-surface-elevated border border-brand/40 rounded text-sm text-white focus:outline-none focus:border-brand"
          >
            <option value="">-</option>
            {/* 現在値がoptionsに含まれていない場合も表示 */}
            {editValue && !field.options.includes(editValue) && (
              <option key={editValue} value={editValue}>{editValue}（現在値）</option>
            )}
            {field.options.map((opt) => (
              <option key={opt} value={opt}>{opt === "true" ? "はい" : opt === "false" ? "いいえ" : opt}</option>
            ))}
          </select>
        ) : (
          <input
            type={fieldType}
            value={editValue}
            onChange={(e) => onEditChange(field.key, e.target.value)}
            step={fieldType === "number" ? "any" : undefined}
            className="w-full mt-0.5 px-2 py-1 bg-surface-elevated border border-brand/40 rounded text-sm text-white focus:outline-none focus:border-brand"
          />
        )
      ) : fieldType === "toggle" ? (
        <div className="mt-1">
          {displayValue === "あり" ? (
            <span className="inline-flex items-center gap-1 text-sm text-green-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              あり
            </span>
          ) : (
            <span className="text-sm text-gray-500">なし</span>
          )}
        </div>
      ) : displayValue.startsWith("http") ? (
        <a href={displayValue} target="_blank" rel="noopener noreferrer" className="text-sm text-brand hover:underline mt-0.5 truncate block" title={displayValue}>
          {displayValue.length > 40 ? displayValue.slice(0, 40) + "..." : displayValue}
        </a>
      ) : (
        <p className="text-sm text-white mt-0.5 truncate" title={displayValue}>
          {displayValue}
        </p>
      )}
    </div>
  );
}

// ================================================================
// セクション定義
// ================================================================

function buildBasicFields(c: CustomerWithRelations): FieldDef[] {
  return [
    { key: "name", label: "名前", source: "manual", table: "customer", getValue: () => c.name },
    { key: "email", label: "メール", source: "manual", table: "customer", getValue: () => c.email || "-" },
    { key: "phone", label: "電話番号", source: "manual", table: "customer", getValue: () => c.phone || "-" },
    { key: "attribute", label: "属性", source: "manual", type: "select", options: [
      "既卒", "既卒・中途", "既卒・中途(3年目未満)", "既卒・中途(3年目以上7年目未満)", "既卒・中途(7年目以上)", "中途",
      "新卒", "24卒", "24卒(学部卒)", "24卒(院卒)", "25卒", "25卒(学部卒)", "25卒(院卒)",
      "26卒", "26卒(学部卒)", "26卒(院卒)", "27卒", "27卒(学部卒)", "27卒(院卒)",
      "28卒", "28卒(学部卒)", "28卒(院卒)", "不明",
    ], table: "customer", getValue: () => c.attribute },
    { key: "application_date", label: "申込日", source: "manual", type: "date", table: "customer", getValue: () => c.application_date || "-" },
    { key: "utm_source", label: "流入元", source: "sync", getValue: () => `${c.utm_source || "-"} / ${c.utm_medium || "-"}` },
    { key: "university", label: "大学", source: "manual", table: "customer", getValue: () => c.university || "-" },
    { key: "faculty", label: "学部", source: "manual", table: "customer", getValue: () => c.faculty || "-" },
    { key: "priority", label: "優先度", source: "manual", type: "select", options: ["高", "中", "低", ""], table: "customer", getValue: () => c.priority || "-" },
    { key: "initial_level", label: "初期レベル", source: "manual", table: "customer", getValue: () => c.initial_level || "-" },
    { key: "career_history", label: "経歴", source: "manual", type: "textarea", table: "customer", getValue: () => c.career_history || "-" },
    { key: "target_companies", label: "志望企業", source: "manual", table: "customer", getValue: () => c.target_companies || "-" },
    { key: "target_firm_type", label: "対策ファーム", source: "manual", table: "customer", getValue: () => c.target_firm_type || "-" },
    { key: "transfer_intent", label: "転職意向", source: "manual", table: "customer", getValue: () => c.transfer_intent || "-" },
    { key: "notes", label: "備考", source: "manual", type: "textarea", table: "customer", getValue: () => c.notes || "-" },
    { key: "caution_notes", label: "注意事項", source: "manual", type: "textarea", table: "customer", getValue: () => c.caution_notes || "-" },
    { key: "name_kana", label: "フリガナ", source: "manual", table: "customer", getValue: () => c.name_kana || "-" },
    { key: "birth_date", label: "生年月日", source: "manual", type: "date", table: "customer", getValue: () => formatDate(c.birth_date ?? null) },
    { key: "karte_email", label: "メアド(カルテ)", source: "sync", getValue: () => c.karte_email || "-" },
    { key: "karte_phone", label: "電話番号(カルテ)", source: "sync", getValue: () => c.karte_phone || "-" },
    { key: "graduation_year", label: "卒業年", source: "manual", table: "customer", getValue: () => c.graduation_year?.toString() || "-" },
    { key: "application_reason", label: "申し込みの決め手", source: "sync", getValue: () => c.application_reason || "-" },
    { key: "application_reason_karte", label: "申込の決め手(カルテ)", source: "sync", getValue: () => c.application_reason_karte || "-" },
    { key: "program_interest", label: "有料プログラムへの関心", source: "sync", getValue: () => c.program_interest || "-" },
    { key: "desired_schedule", label: "希望期間・頻度", source: "sync", getValue: () => c.desired_schedule || "-" },
    { key: "purchased_content", label: "購入コンテンツ", source: "sync", getValue: () => c.purchased_content || "-" },
    { key: "parent_support", label: "親御様からの支援", source: "sync", getValue: () => c.parent_support || "-" },
    { key: "sns_accounts", label: "就活アカウント(X)", source: "sync", getValue: () => c.sns_accounts || "-" },
    { key: "reference_media", label: "参考メディア", source: "sync", getValue: () => c.reference_media || "-" },
    { key: "hobbies", label: "趣味・特技", source: "sync", getValue: () => c.hobbies || "-" },
    { key: "behavioral_traits", label: "行動特性", source: "sync", getValue: () => c.behavioral_traits || "-" },
    { key: "other_background", label: "その他要望・特記事項", source: "sync", getValue: () => c.other_background || "-" },
    { key: "utm_campaign", label: "utm_campaign", source: "sync", getValue: () => c.utm_campaign || "-" },
    { key: "utm_id", label: "utm_id", source: "sync", getValue: () => c.utm_id || "-" },
    // 営業から移動（最後の営業報告フォームから同期）
    { key: "sales_content", label: "営業内容", source: "sync", type: "textarea", table: "pipeline", getValue: () => c.pipeline?.sales_content || "-" },
    { key: "sales_strategy", label: "営業方針", source: "sync", type: "textarea", table: "pipeline", getValue: () => c.pipeline?.sales_strategy || "-" },
    { key: "jicoo_message", label: "jicooメッセージ", source: "sync", type: "textarea", table: "pipeline", getValue: () => c.pipeline?.jicoo_message || "-" },
  ];
}

function buildContractFields(c: CustomerWithRelations, firstPaidDate?: string | null, paidTotal?: number): FieldDef[] {
  if (!c.contract) return [];
  return [
    { key: "plan_name", label: "プラン", source: "manual", table: "contract", getValue: () => c.contract?.plan_name || "-" },
    { key: "changed_plan", label: "変更プラン", source: "manual", table: "contract", getValue: () => c.contract?.changed_plan || "-" },
    { key: "confirmed_amount", label: "確定売上", source: "sync", table: "contract", getValue: () => paidTotal != null && paidTotal > 0 ? formatCurrency(paidTotal) : "-" },
    { key: "first_amount", label: "一次金額", source: "manual", type: "number", table: "contract", getValue: () => c.contract?.first_amount ? formatCurrency(c.contract.first_amount) : "-" },
    { key: "discount", label: "割引", source: "manual", type: "number", table: "contract", getValue: () => c.contract?.discount ? formatCurrency(c.contract.discount) : "なし" },
    { key: "billing_status", label: "請求状況", source: "manual", type: "select", options: ["未請求", "請求済", "入金済", "返金済"], table: "contract", getValue: () => c.contract?.billing_status || "-" },
    { key: "payment_date", label: "入金日", source: "manual", type: "date", table: "contract", getValue: () => formatDate(firstPaidDate || c.contract?.payment_date || null) },
    { key: "subsidy_eligible", label: "補助金対象", source: "manual", type: "select", options: ["true", "false"], table: "contract", getValue: () => c.contract?.subsidy_eligible ? "対象" : "非対象" },
    { key: "enrollment_status", label: "受講状況", source: "manual", type: "select", options: [
      "受講中", "受講終了", "受講終了(未定)", "受講終了(将来)", "受講終了(不明)", "卒業(内定)", "卒業(落ち)", "単発(対象外)", "離脱",
    ], table: "contract", getValue: () => c.contract?.enrollment_status || "-" },
    { key: "referral_category", label: "人材紹介区分", source: "manual", type: "select", options: [
      "フル利用", "一部利用", "スクールのみ", "自社", "該当", "なし",
    ], table: "contract", getValue: () => c.contract?.referral_category || "-" },
    { key: "referral_status", label: "紹介ステータス", source: "manual", type: "select", options: [
      "MVプラン入会済", "MV利用開始済", "初回URL送付済", "面談予約済み", "検討中(URL送付済)", "予約URLを渡していない", "希望してこなかったので渡していない",
    ], table: "contract", getValue: () => c.contract?.referral_status || "-" },
    { key: "progress_sheet_url", label: "Progress Sheet", source: "manual", table: "contract", getValue: () => c.contract?.progress_sheet_url || "-" },
    { key: "second_amount", label: "二次金額", source: "manual", type: "number", table: "contract", getValue: () => c.contract?.second_amount ? formatCurrency(c.contract.second_amount) : "-" },
    { key: "contract_amount", label: "契約金額", source: "manual", type: "number", table: "contract", getValue: () => c.contract?.contract_amount ? formatCurrency(c.contract.contract_amount) : "-" },
    { key: "sales_amount", label: "売上金額", source: "manual", type: "number", table: "contract", getValue: () => c.contract?.sales_amount ? formatCurrency(c.contract.sales_amount) : "-" },
    { key: "subsidy_amount", label: "補助金額", source: "manual", type: "number", table: "contract", getValue: () => c.contract?.subsidy_amount ? formatCurrency(c.contract.subsidy_amount) : "-" },
    { key: "payment_form_url", label: "支払いフォームURL", source: "manual", table: "contract", getValue: () => c.contract?.payment_form_url || "-" },
    { key: "invoice_info", label: "請求書情報", source: "manual", table: "contract", getValue: () => c.contract?.invoice_info || "-" },
  ];
}

/** メンター指導報告から最初のケース面接指導日を算出（アセスメント・ビヘイビア除外） */
function calcFirstCoachingDate(applicationHistory: ApplicationHistoryRecord[]): string | null {
  const EXCLUDE_PATTERNS = ["ビヘイビア", "アセスメント"];
  const mentorReports = applicationHistory
    .filter((r) => r.source === "メンター指導報告")
    .filter((r) => {
      const problem = (r.raw_data as Record<string, string>)?.["解いた問題"] || "";
      return !EXCLUDE_PATTERNS.some((p) => problem.includes(p));
    })
    .map((r) => {
      const dateStr = (r.raw_data as Record<string, string>)?.["指導日"];
      return dateStr ? dateStr.replace(/\//g, "-") : null;
    })
    .filter((d): d is string => !!d)
    .sort();

  return mentorReports.length > 0 ? mentorReports[0] : null;
}

// ================================================================
// 支払い履歴セクション
// ================================================================

const ORDER_TYPE_LABELS: Record<string, string> = {
  main_plan: "メインプラン",
  purchase: "購入",
  video_course: "動画講座",
  additional_coaching: "追加指導",
  other: "その他",
};

const ORDER_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  paid: { label: "入金済", cls: "text-green-400 bg-green-400/10" },
  scheduled: { label: "支払予定", cls: "text-blue-400 bg-blue-400/10" },
  partial: { label: "一部入金", cls: "text-amber-400 bg-amber-400/10" },
  pending: { label: "未入金", cls: "text-gray-400 bg-gray-400/10" },
  refunded: { label: "返金済", cls: "text-red-400 bg-red-400/10" },
  cancelled: { label: "決済エラー", cls: "text-red-400 bg-red-500/20 font-semibold" },
};

function OrdersSection({ orders }: { orders: Order[] }) {
  const totalPaid = orders
    .filter((o) => o.status === "paid" || o.status === "partial")
    .reduce((s, o) => s + (o.amount || 0), 0);
  const totalScheduled = orders
    .filter((o) => o.status === "scheduled")
    .reduce((s, o) => s + (o.amount || 0), 0);
  const paymentErrors = orders.filter((o) => o.status === "cancelled" && o.memo?.includes("payment_error"));

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      {paymentErrors.length > 0 && (
        <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 text-sm font-semibold mb-1">
            <span>⚠</span>
            <span>決済エラー {paymentErrors.length}件</span>
          </div>
          {paymentErrors.map((o) => {
            const msg = (o.raw_data as Record<string, unknown>)?.message as string || "";
            return (
              <div key={o.id} className="text-xs text-red-300/80 ml-5">
                {formatDate(o.paid_at)} — {o.product_name || "不明"} / カード *{o.card_last4 || "?"}{msg ? ` (${msg})` : ""}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          支払い履歴
          <span className="text-xs text-gray-500 ml-2 font-normal normal-case">{orders.length}件</span>
        </h2>
        <div className="flex items-center gap-3">
          {totalScheduled > 0 && (
            <span className="text-xs text-blue-400">
              支払予定 {formatCurrency(totalScheduled)}
            </span>
          )}
          <span className="text-sm font-bold text-white">
            入金済 {formatCurrency(totalPaid)}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-gray-500">
              <th className="text-left py-1.5 pr-3 font-medium">入金日</th>
              <th className="text-left py-1.5 pr-3 font-medium">種別</th>
              <th className="text-left py-1.5 pr-3 font-medium">商品名</th>
              <th className="text-right py-1.5 pr-3 font-medium">金額</th>
              <th className="text-left py-1.5 pr-3 font-medium">決済方法</th>
              <th className="text-left py-1.5 pr-3 font-medium">分割</th>
              <th className="text-left py-1.5 font-medium">状態</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const statusMeta = ORDER_STATUS_LABELS[o.status] || { label: o.status, cls: "text-gray-400" };
              const installmentLabel = o.installment_total && o.installment_total > 1
                ? `${o.installment_index || "?"}/${o.installment_total}`
                : "-";
              const paymentLabel = o.payment_method === "credit_card"
                ? `カード${o.card_last4 ? ` *${o.card_last4}` : ""}`
                : o.payment_method === "bank_transfer"
                  ? "銀行振込"
                  : o.payment_method || "-";

              return (
                <tr key={o.id} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                  <td className="py-1.5 pr-3 text-gray-400">{formatDate(o.paid_at)}</td>
                  <td className="py-1.5 pr-3 text-gray-300">{ORDER_TYPE_LABELS[o.order_type] || o.order_type}</td>
                  <td className="py-1.5 pr-3 text-gray-300 max-w-[200px] truncate" title={o.product_name || ""}>
                    {o.product_name || "-"}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-medium text-white">
                    {formatCurrency(o.amount)}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-400">{paymentLabel}</td>
                  <td className="py-1.5 pr-3 text-gray-400">{installmentLabel}</td>
                  <td className="py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusMeta.cls}`}>
                      {statusMeta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 売上見込セクション（構造化表示） */
function RevenueSection({ customer, orders }: { customer: CustomerWithRelations; orders: Order[] }) {
  const schoolConfirmed = orders.filter(o => o.status === "paid" || o.status === "partial" || o.status === "scheduled").reduce((s, o) => s + (o.amount || 0), 0);
  const subsidy = getSubsidyAmount(customer);
  const agentConfirmed = isAgentConfirmed(customer) ? calcExpectedReferralFee(customer) : 0;
  const confirmedTotal = schoolConfirmed + subsidy + agentConfirmed;

  const agentProjected = calcAgentProjectedRevenue(customer);
  const salesProjection = calcSalesProjection(customer);

  const closingProb = calcClosingProbability(customer);
  const expectedLtv = calcExpectedLTV(customer);

  const Row = ({ label, value, bold, sub }: { label: string; value: string; bold?: boolean; sub?: boolean }) => (
    <div className={`flex items-center justify-between py-1 ${sub ? "pl-4" : ""}`}>
      <span className={`text-xs ${sub ? "text-gray-500" : "text-gray-400"}`}>{label}</span>
      <span className={`text-sm ${bold ? "font-bold text-white" : "text-gray-300"}`}>{value}</span>
    </div>
  );

  const Divider = () => <div className="border-t border-white/[0.06] my-1" />;

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">売上サマリー</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 確定売上 */}
        <div className="bg-surface-elevated rounded-lg p-3">
          <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider mb-1">確定売上</p>
          <Row label="スクール" value={formatCurrency(schoolConfirmed)} sub />
          {subsidy > 0 && <Row label="補助金" value={formatCurrency(subsidy)} sub />}
          {agentConfirmed > 0 && <Row label="人材（確定）" value={formatCurrency(agentConfirmed)} sub />}
          <Divider />
          <Row label="合計" value={formatCurrency(confirmedTotal)} bold />
        </div>

        {/* 見込売上（成約者） */}
        <div className="bg-surface-elevated rounded-lg p-3">
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">見込売上</p>
          <Row label="確定売上" value={formatCurrency(confirmedTotal)} sub />
          {agentProjected > 0 && <Row label="人材（見込）" value={formatCurrency(agentProjected)} sub />}
          <Divider />
          <Row label="成約者見込LTV" value={salesProjection > 0 ? formatCurrency(salesProjection) : "-"} bold />
        </div>

        {/* 期待値（未成約含む） */}
        <div className="bg-surface-elevated rounded-lg p-3">
          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">期待値</p>
          <Row label="成約見込率" value={formatPercent(closingProb)} sub />
          {salesProjection > 0 ? (
            <>
              <Row label="= 見込売上（成約済）" value="" sub />
            </>
          ) : (
            <>
              <Row label={`デフォルトLTV × ${formatPercent(closingProb)}`} value="" sub />
            </>
          )}
          <Divider />
          <Row label="見込LTV" value={expectedLtv > 0 ? formatCurrency(expectedLtv) : "-"} bold />
        </div>
      </div>
    </div>
  );
}

function buildPipelineFields(c: CustomerWithRelations): FieldDef[] {
  if (!c.pipeline) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = c.pipeline as any;
  return [
    { key: "stage", label: "ステージ", source: "manual", type: "select", options: [
      "日程未確", "未実施", "実施不可",
      "検討中", "長期検討",
      "成約", "成約(追加指導経由)", "成約見込(未入金)", "途中解約(成約)",
      "その他購入", "動画講座購入", "追加指導", "追加指導(NoShow)", "追加指導(CL)",
      "NoShow", "CL",
      "失注", "失注見込", "失注見込(自動)", "全額返金",
      "キャンセル", "直前キャンセル",
    ], table: "pipeline", getValue: () => c.pipeline?.stage || "-" },
    { key: "probability", label: "営業角度", source: "sync", type: "number", table: "pipeline", getValue: () => c.pipeline?.probability != null ? formatPercent(c.pipeline.probability) : "-" },
    { key: "meeting_scheduled_date", label: "面談予定日", source: "manual", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.meeting_scheduled_date ?? null) },
    { key: "meeting_url", label: "会議URL", source: "sync", table: "pipeline", getValue: () => {
      const url = (c.pipeline as Record<string, unknown> | undefined)?.meeting_url as string | null;
      return url || "-";
    }},
    // 営業日①②③（営業報告フォームから同期）
    { key: "sales_date", label: "営業日①", source: "sync", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.sales_date ?? null) },
    { key: "sales_date_2", label: "営業日②", source: "sync", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.sales_date_2 ?? null) },
    { key: "sales_date_3", label: "営業日③", source: "sync", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.sales_date_3 ?? null) },
    // 営業日区分①②③（営業報告フォームから同期）
    { key: "meeting_category_1", label: "営業日①区分", source: "sync", table: "pipeline", getValue: () => (p.meeting_category_1 as string) || "-" },
    { key: "meeting_category_2", label: "営業日②区分", source: "sync", table: "pipeline", getValue: () => (p.meeting_category_2 as string) || "-" },
    { key: "meeting_category_3", label: "営業日③区分", source: "sync", table: "pipeline", getValue: () => (p.meeting_category_3 as string) || "-" },
    // 営業担当①②③（営業報告フォームから同期）
    { key: "sales_person", label: "営業担当①", source: "sync", table: "pipeline", getValue: () => c.pipeline?.sales_person || "-" },
    { key: "sales_person_2", label: "営業担当②", source: "sync", table: "pipeline", getValue: () => (p.sales_person_2 as string) || "-" },
    { key: "sales_person_3", label: "営業担当③", source: "sync", table: "pipeline", getValue: () => (p.sales_person_3 as string) || "-" },
    { key: "decision_factor", label: "ネック要因", source: "sync", table: "pipeline", getValue: () => c.pipeline?.decision_factor || "-" },
    { key: "comparison_services", label: "比較サービス", source: "sync", table: "pipeline", getValue: () => c.pipeline?.comparison_services || "-" },
    // 返答日①②③（営業報告フォームから同期）
    { key: "response_date", label: "返答日①", source: "sync", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.response_date ?? null) },
    { key: "response_date_2", label: "返答日②", source: "sync", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.response_date_2 ?? null) },
    { key: "response_date_3", label: "返答日③", source: "sync", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.response_date_3 ?? null) },
    // 提案プラン①②③（営業報告フォームから同期）
    { key: "additional_plan", label: "提案プラン①", source: "sync", table: "pipeline", getValue: () => c.pipeline?.additional_plan || "-" },
    { key: "additional_plan_2", label: "提案プラン②", source: "sync", table: "pipeline", getValue: () => (p.additional_plan_2 as string) || "-" },
    { key: "additional_plan_3", label: "提案プラン③", source: "sync", table: "pipeline", getValue: () => (p.additional_plan_3 as string) || "-" },
    { key: "projected_amount", label: "売上見込", source: "manual", type: "number", table: "pipeline", getValue: () => c.pipeline?.projected_amount ? formatCurrency(c.pipeline.projected_amount) : "-" },
    { key: "agent_interest", label: "エージェント希望", source: "sync", getValue: () => c.pipeline?.agent_interest_at_application ? "あり" : "なし" },
    { key: "lead_time", label: "リードタイム", source: "sync", getValue: () => c.pipeline?.lead_time || "-" },
    { key: "initial_channel", label: "初回認知経路", source: "sync", getValue: () => c.pipeline?.initial_channel || "-" },
    { key: "marketing_memo", label: "マーケメモ", source: "manual", type: "textarea", table: "pipeline", getValue: () => c.pipeline?.marketing_memo || "-" },
    { key: "sales_route", label: "経路(営業)", source: "sync", getValue: () => c.pipeline?.sales_route || c.pipeline?.route_by_sales || "-" },
    { key: "agent_confirmation", label: "エージェント利用意向", source: "sync", getValue: () => c.pipeline?.agent_confirmation || "-" },
    { key: "first_reward_category", label: "一次報酬分類", source: "sync", getValue: () => c.pipeline?.first_reward_category || "-" },
    { key: "performance_reward_category", label: "成果報酬分類", source: "sync", getValue: () => c.pipeline?.performance_reward_category || "-" },
    { key: "google_ads_target", label: "Google広告成果対象", source: "sync", getValue: () => c.pipeline?.google_ads_target || "-" },
    { key: "sales_form_status", label: "営業フォーム提出状況", source: "sync", getValue: () => c.pipeline?.sales_form_status || "-" },
  ];
}

function buildLearningFields(c: CustomerWithRelations, appHistory?: ApplicationHistoryRecord[]): FieldDef[] {
  if (!c.learning) return [];
  const firstCoachingDate = appHistory ? calcFirstCoachingDate(appHistory) : null;
  return [
    { key: "mentor_name", label: "指導メンター", source: "sync", table: "learning", getValue: () => c.learning?.mentor_name || "-" },
    { key: "contract_months", label: "契約月数", source: "manual", type: "number", table: "learning", getValue: () => c.learning?.contract_months != null ? `${c.learning.contract_months}ヶ月` : "-" },
    { key: "coaching_start_date", label: "指導開始日", source: "calc", getValue: () => firstCoachingDate ? formatDate(firstCoachingDate) : "-" },
    { key: "coaching_end_date", label: "指導終了日", source: "manual", type: "date", table: "learning", getValue: () => formatDate(c.learning?.coaching_end_date ?? null) },
    { key: "last_coaching_date", label: "最終指導日", source: "sync", type: "date", table: "learning", getValue: () => formatDate(c.learning?.last_coaching_date ?? null) },
    { key: "total_sessions", label: "契約指導回数", source: "manual", type: "number", table: "learning", getValue: () => c.learning?.total_sessions?.toString() || "-" },
    { key: "completed_sessions", label: "指導完了数", source: "sync", type: "number", table: "learning", getValue: () => c.learning?.completed_sessions != null ? c.learning.completed_sessions.toString() : "-" },
    { key: "remaining", label: "残指導回数", source: "calc", getValue: () => `${calcRemainingSessions(c)}回` },
    { key: "schedule_progress", label: "日程消化率", source: "calc", getValue: () => { const v = calcScheduleProgress(c); return v !== null ? formatPercent(v) : "-"; } },
    { key: "session_progress", label: "指導消化率", source: "calc", getValue: () => { const v = calcSessionProgress(c); return v !== null ? formatPercent(v) : "-"; } },
    { key: "progress_status", label: "進捗", source: "calc", getValue: () => calcProgressStatus(c) },
    { key: "current_level", label: "現在のレベル", source: "manual", table: "learning", getValue: () => c.learning?.current_level || "-" },
    { key: "level_fermi", label: "フェルミ", source: "sync", getValue: () => c.learning?.level_fermi || "-" },
    { key: "level_case", label: "ケース", source: "sync", getValue: () => c.learning?.level_case || "-" },
    { key: "level_mck", label: "McK", source: "sync", getValue: () => c.learning?.level_mck || "-" },
    { key: "weekly_sessions", label: "週あたり指導数", source: "manual", type: "number", table: "learning", getValue: () => c.learning?.weekly_sessions?.toString() || "-" },
    { key: "extension_days", label: "延長(日)", source: "manual", type: "number", table: "learning", getValue: () => c.learning?.extension_days?.toString() || "-" },
    { key: "coaching_requests", label: "指導要望", source: "manual", type: "textarea", table: "learning", getValue: () => c.learning?.coaching_requests || "-" },
    { key: "enrollment_reason", label: "入会理由", source: "manual", type: "textarea", table: "learning", getValue: () => c.learning?.enrollment_reason || "-" },
    { key: "selection_status", label: "選考状況", source: "manual", table: "learning", getValue: () => c.learning?.selection_status || "-" },
    { key: "level_up_range", label: "レベルアップ幅", source: "sync", getValue: () => c.learning?.level_up_range || "-" },
    { key: "mentoring_satisfaction", label: "メンタリング満足度", source: "sync", getValue: () => c.learning?.mentoring_satisfaction || "-" },
    { key: "initial_coaching_level", label: "指導開始時レベル", source: "sync", getValue: () => c.learning?.initial_coaching_level || "-" },
    { key: "attendance_rate", label: "出席率", source: "sync", getValue: () => c.learning?.attendance_rate != null ? formatPercent(c.learning.attendance_rate) : "-" },
    { key: "progress_text", label: "進捗テキスト", source: "sync", getValue: () => c.learning?.progress_text || "-" },
    { key: "case_interview_progress", label: "ケース面接進捗", source: "sync", getValue: () => c.learning?.case_interview_progress || "-" },
    { key: "case_interview_weaknesses", label: "ケース面接苦手", source: "sync", getValue: () => c.learning?.case_interview_weaknesses || "-" },
    { key: "behavior_session1", label: "ビヘイビア1回目", source: "sync", getValue: () => c.learning?.behavior_session1 || "-" },
    { key: "behavior_session2", label: "ビヘイビア2回目", source: "sync", getValue: () => c.learning?.behavior_session2 || "-" },
    { key: "assessment_session1", label: "アセスメント1回目", source: "sync", getValue: () => c.learning?.assessment_session1 || "-" },
    { key: "assessment_session2", label: "アセスメント2回目", source: "sync", getValue: () => c.learning?.assessment_session2 || "-" },
    { key: "offer_probability_at_end", label: "内定確度判定(終了時)", source: "sync", getValue: () => c.learning?.offer_probability_at_end || "-" },
    { key: "additional_coaching_proposal", label: "追加指導提案(終了時)", source: "sync", getValue: () => c.learning?.additional_coaching_proposal || "-" },
    { key: "interview_timing_at_end", label: "面接予定(終了時)", source: "sync", getValue: () => c.learning?.interview_timing_at_end || "-" },
    { key: "target_companies_at_end", label: "受験企業(終了時)", source: "sync", getValue: () => c.learning?.target_companies_at_end || "-" },
    { key: "start_email_sent", label: "開始メール送付", source: "sync", getValue: () => c.learning?.start_email_sent || "-" },
  ];
}

// エージェントセクションは専用ページ(/agents)に移動済み

// ================================================================
// セクションコンポーネント
// ================================================================

function Section({
  title,
  fields,
  customer,
  isEditing,
  editValues,
  onEditChange,
  cols = 4,
  children,
}: {
  title: string;
  fields: FieldDef[];
  customer: CustomerWithRelations;
  isEditing: boolean;
  editValues: Record<string, string>;
  onEditChange: (key: string, value: string) => void;
  cols?: number;
  children?: React.ReactNode;
}) {
  if (fields.length === 0 && !children) return null;

  const gridCls = cols === 5
    ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-2"
    : cols === 3
      ? "grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2"
      : "grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2";

  // テキスト系のフィールドとグリッド系を分離
  const gridFields = fields.filter(f => f.type !== "textarea");
  const textFields = fields.filter(f => f.type === "textarea");

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h2>
      <div className={gridCls}>
        {gridFields.map((f) => (
          <InlineField
            key={f.key}
            field={f}
            customer={customer}
            isEditing={isEditing}
            editValue={editValues[`${f.table || ""}.${f.key}`] ?? ""}
            onEditChange={(key, val) => onEditChange(`${f.table || ""}.${key}`, val)}
          />
        ))}
      </div>
      {textFields.map((f) => (
        <div key={f.key} className="mt-3">
          <InlineField
            field={f}
            customer={customer}
            isEditing={isEditing}
            editValue={editValues[`${f.table || ""}.${f.key}`] ?? ""}
            onEditChange={(key, val) => onEditChange(`${f.table || ""}.${key}`, val)}
          />
        </div>
      ))}
      {children}
    </div>
  );
}

// ================================================================
// メインコンポーネント
// ================================================================

interface CustomerDetailClientProps {
  customer: CustomerWithRelations;
  activities: Activity[];
  emails: CustomerEmail[];
  applicationHistory: ApplicationHistoryRecord[];
  orders: Order[];
  mentors: MentorAssignment[];
}

export function CustomerDetailClient({
  customer: initialCustomer,
  activities,
  emails,
  applicationHistory,
  orders,
  mentors,
}: CustomerDetailClientProps) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [emailList] = useState(emails);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("edit") === "true") {
      startEditing();
    }
  }, [searchParams]);

  // 編集開始: 全フィールドの現在値をeditValuesにセット
  const startEditing = useCallback(() => {
    const vals: Record<string, string> = {};
    // ISO日付 → YYYY-MM-DD に変換（input type="date" 用）
    const toDateValue = (v: unknown): string => {
      if (v == null || v === "") return "";
      const s = String(v);
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // ISO 8601 → YYYY-MM-DD
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      return d.toISOString().slice(0, 10);
    };
    const dateKeys = new Set(["meeting_scheduled_date", "sales_date", "sales_date_2", "sales_date_3", "response_date", "response_date_2", "response_date_3", "payment_date", "coaching_end_date", "last_coaching_date", "placement_date", "application_date"]);
    // customer fields
    const cFields = customer as unknown as unknown as Record<string, unknown>;
    for (const key of ["name", "email", "phone", "attribute", "priority", "university", "faculty", "notes", "caution_notes"]) {
      vals[`customer.${key}`] = cFields[key] != null ? String(cFields[key]) : "";
    }
    // pipeline fields
    if (customer.pipeline) {
      const p = customer.pipeline as unknown as Record<string, unknown>;
      for (const key of ["stage", "probability", "meeting_scheduled_date", "sales_date", "sales_date_2", "sales_date_3", "response_date", "response_date_2", "response_date_3", "decision_factor", "sales_content", "sales_strategy"]) {
        vals[`pipeline.${key}`] = dateKeys.has(key) ? toDateValue(p[key]) : (p[key] != null ? String(p[key]) : "");
      }
    }
    // contract fields
    if (customer.contract) {
      const ct = customer.contract as unknown as Record<string, unknown>;
      for (const key of ["plan_name", "confirmed_amount", "first_amount", "discount", "billing_status", "subsidy_eligible", "payment_date", "changed_plan"]) {
        vals[`contract.${key}`] = dateKeys.has(key) ? toDateValue(ct[key]) : (ct[key] != null ? String(ct[key]) : "");
      }
    }
    // learning fields
    if (customer.learning) {
      const l = customer.learning as unknown as Record<string, unknown>;
      for (const key of ["mentor_name", "coaching_end_date", "last_coaching_date", "total_sessions", "completed_sessions", "current_level"]) {
        vals[`learning.${key}`] = dateKeys.has(key) ? toDateValue(l[key]) : (l[key] != null ? String(l[key]) : "");
      }
    }
    // agent fields
    if (customer.agent) {
      const a = customer.agent as unknown as Record<string, unknown>;
      for (const key of ["job_search_status", "selection_status", "offer_company", "offer_salary", "offer_rank", "referral_fee_rate", "placement_confirmed", "placement_date", "margin"]) {
        vals[`agent.${key}`] = dateKeys.has(key) ? toDateValue(a[key]) : (a[key] != null ? String(a[key]) : "");
      }
    }
    setEditValues(vals);
    setIsEditing(true);
  }, [customer]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditValues({});
  }, []);

  const handleEditChange = useCallback((compositeKey: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [compositeKey]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // editValuesからテーブル別に変更を抽出
      const payload: Record<string, Record<string, unknown>> = {};
      for (const [compositeKey, val] of Object.entries(editValues)) {
        const dotIdx = compositeKey.indexOf(".");
        if (dotIdx < 0) continue;
        const table = compositeKey.slice(0, dotIdx);
        const key = compositeKey.slice(dotIdx + 1);
        if (!table) continue;

        // 元の値と比較
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const source: any = table === "customer" ? customer : (customer as any)[table];
        if (!source) continue;
        const origVal = source[key];
        const origStr = origVal != null ? String(origVal) : "";
        if (val === origStr) continue;

        if (!payload[table]) payload[table] = {};

        // 型変換
        const numFields = ["confirmed_amount", "first_amount", "discount", "probability", "total_sessions", "completed_sessions", "offer_salary", "referral_fee_rate", "margin"];
        if (numFields.includes(key)) {
          payload[table][key] = val ? Number(val) : null;
        } else if (key === "subsidy_eligible") {
          payload[table][key] = val === "true";
        } else {
          payload[table][key] = val || null;
        }
      }

      if (Object.keys(payload).length === 0) {
        setIsEditing(false);
        return;
      }

      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setIsEditing(false);
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "保存に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  }, [editValues, customer]);

  const handleDelete = async () => {
    if (!confirm(`「${customer.name}」を削除しますか？\n関連データもすべて削除されます。`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/customers");
      } else {
        const data = await res.json();
        alert(data.error || "削除に失敗しました");
      }
    } finally {
      setDeleting(false);
    }
  };

  const basicFields = useMemo(() => buildBasicFields(customer), [customer]);
  const firstPaidDate = useMemo(() => {
    const paid = orders.filter(o => o.status === "paid" && o.paid_at).sort((a, b) => (a.paid_at! > b.paid_at! ? 1 : -1));
    return paid.length > 0 ? paid[0].paid_at!.split("T")[0].split(" ")[0] : null;
  }, [orders]);
  const paidTotal = useMemo(() => {
    return orders.filter(o => o.status === "paid" || o.status === "partial" || o.status === "scheduled").reduce((s, o) => s + (o.amount || 0), 0);
  }, [orders]);
  const contractFields = useMemo(() => buildContractFields(customer, firstPaidDate, paidTotal), [customer, firstPaidDate, paidTotal]);
  const pipelineFields = useMemo(() => buildPipelineFields(customer), [customer]);
  const learningFields = useMemo(() => buildLearningFields(customer, applicationHistory), [customer, applicationHistory]);

  return (
    <div className="p-4 space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Link href="/customers" className="text-gray-400 hover:text-gray-300 transition-colors text-sm">
          ← 戻る
        </Link>
        <div className="flex-1 flex items-center gap-3">
          <div className="w-12 h-12 bg-brand-muted text-brand rounded-full flex items-center justify-center font-bold text-lg shrink-0">
            {customer.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{customer.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(customer.attribute)}`}>
                {customer.attribute}
              </span>
              {customer.pipeline && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(customer.pipeline.stage)}`}>
                  {customer.pipeline.stage}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ソースバッジ凡例（管理者のみ） */}
        <SourceBadgeLegend />

        <div className="flex items-center gap-2 shrink-0">
          {isEditing ? (
            <>
              <button onClick={cancelEditing} className="px-3 py-2 text-gray-400 hover:text-white text-xs transition-colors">
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-2 text-red-400 hover:text-red-300 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {deleting ? "削除中..." : "削除"}
              </button>
              <button
                onClick={startEditing}
                className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors"
              >
                編集
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2カラムレイアウト: 左=基本+契約+売上、右=営業+学習 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* 左カラム */}
        <div className="space-y-3">
          <Section title="基本情報" fields={basicFields} customer={customer} isEditing={isEditing} editValues={editValues} onEditChange={handleEditChange} cols={4}>
            {emailList.length > 1 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-[10px] text-gray-500 font-medium mb-1">その他メール</p>
                <div className="flex flex-wrap gap-2">
                  {emailList.filter(em => !em.is_primary).map((em) => (
                    <span key={em.id} className="text-xs text-gray-300 bg-surface-elevated px-2 py-1 rounded">{em.email}</span>
                  ))}
                </div>
              </div>
            )}
            {customer.career_history && (
              <div className="mt-3">
                <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">経歴 <SourceBadge source="sync" /></p>
                <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-2 rounded mt-0.5">{customer.career_history}</p>
              </div>
            )}
            {customer.target_companies && (
              <div className="mt-3">
                <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">志望企業 <SourceBadge source="sync" /></p>
                <p className="text-sm text-gray-300 bg-surface-elevated p-2 rounded mt-0.5">{customer.target_companies}</p>
              </div>
            )}
          </Section>

          <Section title="契約" fields={contractFields} customer={customer} isEditing={isEditing} editValues={editValues} onEditChange={handleEditChange} cols={4} />

          {/* 支払い履歴 */}
          {orders.length > 0 && (
            <OrdersSection orders={orders} />
          )}

          <RevenueSection customer={customer} orders={orders} />

        </div>

        {/* 右カラム */}
        <div className="space-y-3">
          <Section title="営業・商談" fields={pipelineFields} customer={customer} isEditing={isEditing} editValues={editValues} onEditChange={handleEditChange} cols={4} />

          <Section title="学習状況" fields={learningFields} customer={customer} isEditing={isEditing} editValues={editValues} onEditChange={handleEditChange} cols={4}>
            {customer.learning?.case_interview_progress && (
              <div className="mt-3">
                <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">ケース面接対策 <SourceBadge source="sync" /></p>
                <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-2 rounded mt-0.5">{customer.learning.case_interview_progress}</p>
              </div>
            )}
          </Section>

          {/* 担当メンター */}
          {mentors.length > 0 && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">担当メンター</h2>
              <div className="space-y-2">
                {mentors.map((assignment) => (
                  <div key={assignment.id} className="flex items-center justify-between bg-surface-elevated rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-200">{assignment.mentor.name}</span>
                      {assignment.role === "primary" ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-500/20 text-red-400 border border-red-500/30">
                          主担当
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-500/20 text-gray-400 border border-gray-500/30">
                          副担当
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {assignment.mentor.line_url && (
                        <a
                          href={assignment.mentor.line_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-400 hover:text-green-300 hover:underline"
                        >
                          LINE
                        </a>
                      )}
                      {assignment.mentor.booking_url && (
                        <a
                          href={assignment.mentor.booking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          予約
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* プロフィール */}
          <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">プロフィール</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {customer.sns_accounts && (
                <div>
                  <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">SNS <SourceBadge source="sync" /></p>
                  <p className="text-gray-300 mt-0.5">{customer.sns_accounts}</p>
                </div>
              )}
              {customer.reference_media && (
                <div>
                  <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">参考メディア <SourceBadge source="sync" /></p>
                  <p className="text-gray-300 mt-0.5">{customer.reference_media}</p>
                </div>
              )}
              {customer.hobbies && (
                <div>
                  <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">趣味・特技 <SourceBadge source="sync" /></p>
                  <p className="text-gray-300 mt-0.5">{customer.hobbies}</p>
                </div>
              )}
              {customer.behavioral_traits && (
                <div>
                  <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">行動特性 <SourceBadge source="manual" /></p>
                  <p className="text-gray-300 mt-0.5">{customer.behavioral_traits}</p>
                </div>
              )}
            </div>
            {customer.notes && (
              <div className="mt-3">
                <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">備考 <SourceBadge source="manual" /></p>
                <p className="text-sm text-gray-300 bg-yellow-900/20 p-2 rounded mt-0.5">{customer.notes}</p>
              </div>
            )}
            {customer.caution_notes && (
              <div className="mt-3">
                <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">注意事項 <SourceBadge source="manual" /></p>
                <p className="text-sm text-gray-300 bg-red-900/20 p-2 rounded mt-0.5">{customer.caution_notes}</p>
              </div>
            )}
          </div>

          {/* 1回限りフォーム（入塾フォーム・営業報告） */}
          {applicationHistory
            .filter((r) => SINGLE_FORM_SOURCES.includes(r.source || ""))
            .map((r) => (
              <SingleFormSection key={r.id} title={r.source || "フォーム"} record={r} />
            ))}

          {/* 繰り返しフォーム（課題提出・メンター指導報告・エージェント面談報告等） */}
          {applicationHistory.filter((r) => !SINGLE_FORM_SOURCES.includes(r.source || "")).length > 0 && (
            <RepeatingFormSection
              records={applicationHistory.filter((r) => !SINGLE_FORM_SOURCES.includes(r.source || ""))}
            />
          )}

          {/* 活動履歴 */}
          <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">活動履歴</h2>
            <div className="space-y-3">
              {activities.length === 0 && (
                <p className="text-sm text-gray-400">活動履歴がありません</p>
              )}
              {activities.map((activity) => (
                <div key={activity.id} className="border-l-2 border-brand/30 pl-3 py-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium bg-surface-elevated text-gray-300 px-2 py-0.5 rounded">{activity.activity_type}</span>
                    <span className="text-xs text-gray-400">{formatDate(activity.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-300">{activity.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
