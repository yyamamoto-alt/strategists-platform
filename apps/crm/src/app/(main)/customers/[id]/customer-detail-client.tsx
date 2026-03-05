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
  getDealStatusColor,
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
  isAgentCustomer,
  isAgentConfirmed,
  getSubsidyAmount,
} from "@/lib/calc-fields";
import { useRouter } from "next/navigation";
import type { CustomerWithRelations, Activity } from "@strategy-school/shared-db";
import type { CustomerEmail, ApplicationHistoryRecord } from "@/lib/data/spreadsheet-sync";

// ================================================================
// データソースバッジ
// ================================================================

type DataSource = "manual" | "calc" | "sync" | "migration";

const SOURCE_CONFIG: Record<DataSource, { label: string; cls: string; title: string }> = {
  manual: { label: "編集", cls: "text-blue-400 bg-blue-400/10 border-blue-400/20", title: "手動で編集可能" },
  calc: { label: "fx", cls: "text-amber-400 bg-amber-400/10 border-amber-400/20", title: "自動計算値" },
  sync: { label: "同期", cls: "text-green-400 bg-green-400/10 border-green-400/20", title: "フォーム同期で更新" },
  migration: { label: "参照", cls: "text-gray-400 bg-gray-400/10 border-gray-400/20", title: "Excel移行データ（読み取り専用）" },
};

function SourceBadge({ source }: { source: DataSource }) {
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
                <span className="text-xs text-gray-400">{formatDate(r.applied_at)}</span>
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
  type?: "text" | "number" | "date" | "textarea" | "select";
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
        fieldType === "textarea" ? (
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
    { key: "application_date", label: "申込日", source: "sync", getValue: () => formatDate(c.application_date) },
    { key: "utm_source", label: "流入元", source: "sync", getValue: () => `${c.utm_source || "-"} / ${c.utm_medium || "-"}` },
    { key: "university", label: "大学", source: "manual", table: "customer", getValue: () => c.university || "-" },
    { key: "faculty", label: "学部", source: "manual", table: "customer", getValue: () => c.faculty || "-" },
    { key: "priority", label: "優先度", source: "manual", type: "select", options: ["高", "中", "低", ""], table: "customer", getValue: () => c.priority || "-" },
    { key: "initial_level", label: "初期レベル", source: "migration", getValue: () => c.initial_level || "-" },
  ];
}

function buildContractFields(c: CustomerWithRelations): FieldDef[] {
  if (!c.contract) return [];
  return [
    { key: "plan_name", label: "プラン", source: "manual", table: "contract", getValue: () => c.contract?.plan_name || "-" },
    { key: "changed_plan", label: "変更プラン", source: "manual", table: "contract", getValue: () => c.contract?.changed_plan || "-" },
    { key: "confirmed_amount", label: "確定売上(a1)", source: "manual", type: "number", table: "contract", getValue: () => c.contract?.confirmed_amount ? formatCurrency(c.contract.confirmed_amount) : "-" },
    { key: "first_amount", label: "一次金額", source: "manual", type: "number", table: "contract", getValue: () => c.contract?.first_amount ? formatCurrency(c.contract.first_amount) : "-" },
    { key: "discount", label: "割引", source: "manual", type: "number", table: "contract", getValue: () => c.contract?.discount ? formatCurrency(c.contract.discount) : "なし" },
    { key: "billing_status", label: "請求状況", source: "manual", type: "select", options: ["未請求", "請求済", "入金済", "返金済"], table: "contract", getValue: () => c.contract?.billing_status || "-" },
    { key: "payment_date", label: "入金日", source: "manual", type: "date", table: "contract", getValue: () => formatDate(c.contract?.payment_date ?? null) },
    { key: "subsidy_eligible", label: "補助金対象", source: "manual", type: "select", options: ["true", "false"], table: "contract", getValue: () => c.contract?.subsidy_eligible ? "対象" : "非対象" },
  ];
}

function buildRevenueFields(c: CustomerWithRelations): FieldDef[] {
  return [
    { key: "school_confirmed", label: "確定売上(スクール a)", source: "calc", getValue: () => {
      const amt = (c.contract?.confirmed_amount || 0) + getSubsidyAmount(c);
      return amt > 0 ? formatCurrency(amt) : "¥0";
    }},
    { key: "agent_projected", label: "人材見込売上(b)", source: "calc", getValue: () => {
      const v = calcAgentProjectedRevenue(c);
      return v > 0 ? formatCurrency(v) : "¥0";
    }},
    { key: "agent_confirmed", label: "確定売上(人材 c)", source: "calc", getValue: () => {
      return isAgentConfirmed(c) ? formatCurrency(calcExpectedReferralFee(c)) : "¥0";
    }},
    { key: "sales_projection", label: "成約者見込LTV", source: "calc", getValue: () => {
      const v = calcSalesProjection(c);
      return v > 0 ? formatCurrency(v) : "-";
    }},
    { key: "confirmed_total", label: "確定売上合計(e=a+c)", source: "calc", getValue: () => {
      const v = calcConfirmedRevenue(c);
      return v > 0 ? formatCurrency(v) : "¥0";
    }},
    { key: "closing_prob", label: "成約見込率", source: "calc", getValue: () => formatPercent(calcClosingProbability(c)) },
    { key: "expected_ltv", label: "見込LTV(d)", source: "calc", getValue: () => {
      const v = calcExpectedLTV(c);
      return v > 0 ? formatCurrency(v) : "-";
    }},
    { key: "subsidy", label: "補助金額(a2)", source: "calc", getValue: () => {
      const s = getSubsidyAmount(c);
      return s > 0 ? formatCurrency(s) : "¥0";
    }},
  ];
}

function buildPipelineFields(c: CustomerWithRelations): FieldDef[] {
  if (!c.pipeline) return [];
  return [
    { key: "stage", label: "ステージ", source: "manual", table: "pipeline", getValue: () => c.pipeline?.stage || "-" },
    { key: "deal_status", label: "実施状況", source: "manual", type: "select", options: ["進行中", "保留", "完了", "失注", "実施"], table: "pipeline", getValue: () => c.pipeline?.deal_status || "-" },
    { key: "probability", label: "営業角度", source: "manual", type: "number", table: "pipeline", getValue: () => c.pipeline?.probability != null ? formatPercent(c.pipeline.probability) : "-" },
    { key: "meeting_scheduled_date", label: "面談予定日", source: "manual", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.meeting_scheduled_date ?? null) },
    { key: "meeting_conducted_date", label: "面談実施日", source: "manual", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.meeting_conducted_date ?? null) },
    { key: "sales_date", label: "営業日", source: "manual", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.sales_date ?? null) },
    { key: "closing_date", label: "成約日", source: "manual", type: "date", table: "pipeline", getValue: () => formatDate(c.pipeline?.closing_date ?? null) },
    { key: "agent_interest", label: "エージェント希望", source: "sync", getValue: () => c.pipeline?.agent_interest_at_application ? "あり" : "なし" },
    { key: "decision_factor", label: "決め手", source: "manual", table: "pipeline", getValue: () => c.pipeline?.decision_factor || "-" },
    { key: "comparison_services", label: "比較サービス", source: "migration", getValue: () => c.pipeline?.comparison_services || "-" },
    { key: "sales_content", label: "営業内容", source: "manual", type: "textarea", table: "pipeline", getValue: () => c.pipeline?.sales_content || "-" },
    { key: "sales_strategy", label: "営業方針", source: "manual", type: "textarea", table: "pipeline", getValue: () => c.pipeline?.sales_strategy || "-" },
  ];
}

function buildLearningFields(c: CustomerWithRelations): FieldDef[] {
  if (!c.learning) return [];
  return [
    { key: "mentor_name", label: "指導メンター", source: "sync", getValue: () => c.learning?.mentor_name || "-" },
    { key: "contract_months", label: "契約月数", source: "migration", getValue: () => c.learning?.contract_months != null ? `${c.learning.contract_months}ヶ月` : "-" },
    { key: "coaching_start_date", label: "指導開始日", source: "manual", type: "date", table: "learning", getValue: () => formatDate(c.learning?.coaching_start_date ?? null) },
    { key: "coaching_end_date", label: "指導終了日", source: "manual", type: "date", table: "learning", getValue: () => formatDate(c.learning?.coaching_end_date ?? null) },
    { key: "last_coaching_date", label: "最終指導日", source: "sync", getValue: () => formatDate(c.learning?.last_coaching_date ?? null) },
    { key: "total_sessions", label: "契約指導回数", source: "manual", type: "number", table: "learning", getValue: () => c.learning?.total_sessions?.toString() || "-" },
    { key: "completed_sessions", label: "指導完了数", source: "sync", getValue: () => c.learning?.completed_sessions != null ? c.learning.completed_sessions.toString() : "-" },
    { key: "remaining", label: "残指導回数", source: "calc", getValue: () => `${calcRemainingSessions(c)}回` },
    { key: "schedule_progress", label: "日程消化率", source: "calc", getValue: () => { const v = calcScheduleProgress(c); return v !== null ? formatPercent(v) : "-"; } },
    { key: "session_progress", label: "指導消化率", source: "calc", getValue: () => { const v = calcSessionProgress(c); return v !== null ? formatPercent(v) : "-"; } },
    { key: "progress_status", label: "進捗", source: "calc", getValue: () => calcProgressStatus(c) },
    { key: "current_level", label: "現在のレベル", source: "manual", table: "learning", getValue: () => c.learning?.current_level || "-" },
    { key: "level_fermi", label: "フェルミ", source: "sync", getValue: () => c.learning?.level_fermi || "-" },
    { key: "level_case", label: "ケース", source: "sync", getValue: () => c.learning?.level_case || "-" },
    { key: "level_mck", label: "McK", source: "sync", getValue: () => c.learning?.level_mck || "-" },
  ];
}

function buildAgentFields(c: CustomerWithRelations): FieldDef[] {
  if (!c.agent || !isAgentCustomer(c)) return [];
  return [
    { key: "job_search_status", label: "転職活動状況", source: "manual", table: "agent", getValue: () => c.agent?.job_search_status || "-" },
    { key: "selection_status", label: "選考状況", source: "manual", table: "agent", getValue: () => c.agent?.selection_status || "-" },
    { key: "offer_company", label: "内定先", source: "manual", table: "agent", getValue: () => c.agent?.offer_company || "-" },
    { key: "offer_salary", label: "想定年収", source: "manual", type: "number", table: "agent", getValue: () => c.agent?.offer_salary ? formatCurrency(c.agent.offer_salary) : "-" },
    { key: "hire_rate", label: "入社至る率", source: "manual", type: "number", table: "agent", getValue: () => c.agent?.hire_rate != null ? formatPercent(c.agent.hire_rate) : "-" },
    { key: "offer_probability", label: "内定確度", source: "manual", type: "number", table: "agent", getValue: () => c.agent?.offer_probability != null ? formatPercent(c.agent.offer_probability) : "-" },
    { key: "referral_fee_rate", label: "紹介料率", source: "manual", type: "number", table: "agent", getValue: () => c.agent?.referral_fee_rate ? formatPercent(c.agent.referral_fee_rate) : "-" },
    { key: "margin", label: "マージン", source: "manual", type: "number", table: "agent", getValue: () => {
      const m = c.agent?.margin && c.agent.margin > 0 ? c.agent.margin : 0.75;
      return formatPercent(m);
    }},
    { key: "expected_fee", label: "人材紹介報酬期待値(b)", source: "calc", getValue: () => { const v = calcExpectedReferralFee(c); return v > 0 ? formatCurrency(v) : "-"; } },
    { key: "placement_confirmed", label: "人材確定", source: "manual", type: "select", options: ["確定", ""], table: "agent", getValue: () => isAgentConfirmed(c) ? "確定" : "未確定" },
    { key: "placement_date", label: "入社予定日", source: "manual", type: "date", table: "agent", getValue: () => formatDate(c.agent?.placement_date ?? null) },
    { key: "external_agents", label: "外部エージェント", source: "migration", getValue: () => c.agent?.external_agents || "-" },
  ];
}

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
}

export function CustomerDetailClient({
  customer: initialCustomer,
  activities,
  emails,
  applicationHistory,
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
    // customer fields
    const cFields = customer as unknown as unknown as Record<string, unknown>;
    for (const key of ["name", "email", "phone", "attribute", "priority", "university", "faculty", "notes", "caution_notes"]) {
      vals[`customer.${key}`] = cFields[key] != null ? String(cFields[key]) : "";
    }
    // pipeline fields
    if (customer.pipeline) {
      const p = customer.pipeline as unknown as Record<string, unknown>;
      for (const key of ["stage", "deal_status", "probability", "meeting_scheduled_date", "meeting_conducted_date", "sales_date", "closing_date", "decision_factor", "sales_content", "sales_strategy"]) {
        vals[`pipeline.${key}`] = p[key] != null ? String(p[key]) : "";
      }
    }
    // contract fields
    if (customer.contract) {
      const ct = customer.contract as unknown as Record<string, unknown>;
      for (const key of ["plan_name", "confirmed_amount", "first_amount", "discount", "billing_status", "subsidy_eligible", "payment_date", "changed_plan"]) {
        vals[`contract.${key}`] = ct[key] != null ? String(ct[key]) : "";
      }
    }
    // learning fields
    if (customer.learning) {
      const l = customer.learning as unknown as Record<string, unknown>;
      for (const key of ["mentor_name", "coaching_start_date", "coaching_end_date", "total_sessions", "completed_sessions", "current_level"]) {
        vals[`learning.${key}`] = l[key] != null ? String(l[key]) : "";
      }
    }
    // agent fields
    if (customer.agent) {
      const a = customer.agent as unknown as Record<string, unknown>;
      for (const key of ["job_search_status", "selection_status", "offer_company", "offer_salary", "hire_rate", "offer_probability", "referral_fee_rate", "placement_confirmed", "placement_date", "margin"]) {
        vals[`agent.${key}`] = a[key] != null ? String(a[key]) : "";
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
        const numFields = ["confirmed_amount", "first_amount", "discount", "probability", "total_sessions", "completed_sessions", "offer_salary", "hire_rate", "offer_probability", "referral_fee_rate", "margin"];
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
  const contractFields = useMemo(() => buildContractFields(customer), [customer]);
  const revenueFields = useMemo(() => buildRevenueFields(customer), [customer]);
  const pipelineFields = useMemo(() => buildPipelineFields(customer), [customer]);
  const learningFields = useMemo(() => buildLearningFields(customer), [customer]);
  const agentFields = useMemo(() => buildAgentFields(customer), [customer]);

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
              {customer.pipeline && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDealStatusColor(customer.pipeline.deal_status)}`}>
                  {customer.pipeline.deal_status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ソースバッジ凡例 */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] text-gray-500">
          {(["manual", "calc", "sync", "migration"] as DataSource[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <SourceBadge source={s} />
              {SOURCE_CONFIG[s].title.split("（")[0]}
            </span>
          ))}
        </div>

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

          <Section title="契約・入金" fields={contractFields} customer={customer} isEditing={isEditing} editValues={editValues} onEditChange={handleEditChange} cols={4} />

          <Section title="売上見込" fields={revenueFields} customer={customer} isEditing={isEditing} editValues={editValues} onEditChange={handleEditChange} cols={4} />

          {/* エージェント */}
          <Section title="エージェント・転職支援" fields={agentFields} customer={customer} isEditing={isEditing} editValues={editValues} onEditChange={handleEditChange} cols={4}>
            {customer.agent?.agent_memo && (
              <div className="mt-3">
                <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">業務メモ <SourceBadge source="manual" /></p>
                <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-2 rounded mt-0.5">{customer.agent.agent_memo}</p>
              </div>
            )}
          </Section>
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
                  <p className="text-[10px] text-gray-500 font-medium flex items-center gap-0.5">行動特性 <SourceBadge source="migration" /></p>
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
