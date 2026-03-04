"use client";

import { useState, useMemo, useEffect } from "react";
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

// フォーム種類ごとに表示する主要フィールド
const FORM_DISPLAY_FIELDS: Record<string, { key: string; label: string }[]> = {
  "メンター指導報告": [
    { key: "指導日", label: "指導日" },
    { key: "メンター名", label: "メンター" },
    { key: "回次（合計指導回数）", label: "回次" },
    { key: "解いた問題", label: "解いた問題" },
    { key: "よかった点・成長した点", label: "よかった点" },
    { key: "課題・改善点", label: "課題" },
  ],
  "営業報告": [
    { key: "実施日", label: "実施日" },
    { key: "営業担当者名", label: "営業担当" },
    { key: "結果", label: "結果" },
    { key: "入会確度", label: "入会確度" },
    { key: "購入希望/検討しているプラン", label: "検討プラン" },
    { key: "フィードバック内容(簡単にでok)", label: "FB" },
    { key: "ネックになりそうな要素（複数選択可）", label: "ネック" },
  ],
  "課題提出": [
    { key: "タイムスタンプ", label: "提出日" },
    { key: "問題タイプ", label: "問題タイプ" },
    { key: "解いた問題", label: "解いた問題" },
    { key: "担当メンター", label: "メンター" },
    { key: "思考時間", label: "思考時間" },
    { key: "前回メンタリングの満足度", label: "満足度" },
  ],
  "入塾フォーム": [
    { key: "タイムスタンプ", label: "申込日" },
    { key: "お名前", label: "名前" },
    { key: "申込プラン", label: "プラン" },
    { key: "エージェント利用", label: "エージェント" },
  ],
  "指導終了報告": [
    { key: "タイムスタンプ", label: "報告日" },
    { key: "担当メンター名", label: "メンター" },
    { key: "受験予定企業", label: "受験予定企業" },
    { key: "戦コンへの内定確度", label: "戦コン内定確度" },
    { key: "追加指導のご提案", label: "追加指導" },
    { key: "指導期間を通じたレベルアップ幅", label: "レベルアップ幅" },
  ],
  "面接終了後報告": [
    { key: "タイムスタンプ", label: "報告日" },
    { key: "受験企業", label: "受験企業" },
    { key: "選考ステップ", label: "選考" },
    { key: "面接内容", label: "面接内容" },
    { key: "ケース面接で出題された問題", label: "ケース問題" },
  ],
};

function FormDataSection({ records }: { records: ApplicationHistoryRecord[] }) {
  const [activeSource, setActiveSource] = useState<string | null>(null);

  // ソース別にグループ化
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
  const displayFields = FORM_DISPLAY_FIELDS[currentSource];

  return (
    <div className="bg-indigo-950/20 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 border-l-4 border-l-indigo-500 p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
        フォームデータ
        <span className="text-xs text-gray-500 ml-2 font-normal">{records.length}件</span>
      </h2>
      <p className="text-[10px] text-indigo-400 mb-3">フォーム連携データ</p>

      {/* ソースタブ */}
      <div className="flex flex-wrap gap-1 mb-4">
        {sources.map((src) => (
          <button
            key={src}
            onClick={() => setActiveSource(src)}
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

      {/* レコード一覧 */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {currentRecords.map((r) => {
          const rd = (r.raw_data || {}) as Record<string, string>;
          return (
            <div
              key={r.id}
              className="border border-white/5 rounded-lg p-3 bg-surface-elevated"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-400">{formatDate(r.applied_at)}</span>
                {r.notes && <span className="text-[10px] text-gray-500">{r.notes}</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {Object.entries(rd)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[10px] text-gray-500">{k}</p>
                      <p className="text-xs text-gray-300 break-words">
                        {String(v).length > 120 ? String(v).substring(0, 120) + "…" : String(v)}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CustomerDetailClientProps {
  customer: CustomerWithRelations;
  activities: Activity[];
  emails: CustomerEmail[];
  applicationHistory: ApplicationHistoryRecord[];
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (value === "-") return <div />;
  return (
    <div>
      <p className="text-[10px] text-gray-500 font-medium">{label}</p>
      <p className="text-sm text-white mt-0.5">{value}</p>
    </div>
  );
}

// 編集可能フィールド定義
const EDITABLE_FIELDS = {
  customer: [
    { key: "name", label: "名前", type: "text" },
    { key: "email", label: "メール", type: "text" },
    { key: "phone", label: "電話番号", type: "text" },
    { key: "attribute", label: "属性", type: "select", options: ["既卒", "新卒"] },
    { key: "priority", label: "優先度", type: "select", options: ["高", "中", "低", ""] },
    { key: "university", label: "大学", type: "text" },
    { key: "faculty", label: "学部", type: "text" },
    { key: "notes", label: "備考", type: "textarea" },
    { key: "caution_notes", label: "注意事項", type: "textarea" },
  ],
  pipeline: [
    { key: "stage", label: "ステージ", type: "text" },
    { key: "deal_status", label: "ディール状態", type: "select", options: ["進行中", "保留", "完了", "失注"] },
    { key: "probability", label: "営業角度", type: "number" },
    { key: "meeting_scheduled_date", label: "面談予定日", type: "date" },
    { key: "meeting_conducted_date", label: "面談実施日", type: "date" },
    { key: "sales_date", label: "営業日", type: "date" },
    { key: "closing_date", label: "成約日", type: "date" },
    { key: "decision_factor", label: "決め手", type: "text" },
    { key: "sales_content", label: "営業内容", type: "textarea" },
    { key: "sales_strategy", label: "営業方針", type: "textarea" },
  ],
  contract: [
    { key: "plan_name", label: "プラン", type: "text" },
    { key: "confirmed_amount", label: "確定売上", type: "number" },
    { key: "first_amount", label: "一次金額", type: "number" },
    { key: "discount", label: "割引", type: "number" },
    { key: "billing_status", label: "請求状況", type: "select", options: ["未請求", "請求済", "入金済", "返金済"] },
    { key: "subsidy_eligible", label: "補助金対象", type: "select", options: ["true", "false"] },
  ],
  learning: [
    { key: "mentor_name", label: "指導メンター", type: "text" },
    { key: "coaching_start_date", label: "指導開始日", type: "date" },
    { key: "coaching_end_date", label: "指導終了日", type: "date" },
    { key: "total_sessions", label: "契約指導回数", type: "number" },
    { key: "completed_sessions", label: "指導完了数", type: "number" },
    { key: "current_level", label: "現在のレベル", type: "text" },
  ],
  agent: [
    { key: "job_search_status", label: "転職活動状況", type: "text" },
    { key: "selection_status", label: "選考状況", type: "text" },
    { key: "offer_company", label: "内定先", type: "text" },
    { key: "offer_salary", label: "想定年収", type: "number" },
    { key: "hire_rate", label: "入社至る率", type: "number" },
    { key: "offer_probability", label: "内定確度", type: "number" },
    { key: "referral_fee_rate", label: "紹介料率", type: "number" },
    { key: "placement_confirmed", label: "人材確定", type: "select", options: ["true", "false"] },
  ],
} as const;

type EditSection = keyof typeof EDITABLE_FIELDS;

function EditModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerWithRelations;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [activeTab, setActiveTab] = useState<EditSection>("customer");
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const section of Object.keys(EDITABLE_FIELDS) as EditSection[]) {
      init[section] = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const source: any = section === "customer" ? customer : (customer as any)[section];
      if (source) {
        for (const field of EDITABLE_FIELDS[section]) {
          const val = source[field.key];
          init[section][field.key] = val != null ? String(val) : "";
        }
      }
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tabs = [
    { key: "customer" as EditSection, label: "基本情報" },
    { key: "pipeline" as EditSection, label: "営業", show: !!customer.pipeline },
    { key: "contract" as EditSection, label: "契約", show: !!customer.contract },
    { key: "learning" as EditSection, label: "学習", show: !!customer.learning },
    { key: "agent" as EditSection, label: "エージェント", show: !!customer.agent && customer.attribute !== "新卒" },
  ].filter((t) => t.show !== false);

  const handleChange = (section: string, key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      // 変更があったフィールドだけ送る
      const payload: Record<string, Record<string, unknown>> = {};
      for (const section of Object.keys(EDITABLE_FIELDS) as EditSection[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const source: any = section === "customer" ? customer : (customer as any)[section];
        if (!source) continue;
        const changes: Record<string, unknown> = {};
        for (const field of EDITABLE_FIELDS[section]) {
          const original = source[field.key];
          const current = formData[section]?.[field.key] ?? "";
          const origStr = original != null ? String(original) : "";
          if (current !== origStr) {
            if (field.type === "number") {
              changes[field.key] = current ? Number(current) : null;
            } else if (field.type === "select" && (current === "true" || current === "false")) {
              changes[field.key] = current === "true";
            } else {
              changes[field.key] = current || null;
            }
          }
        }
        if (Object.keys(changes).length > 0) {
          payload[section] = changes;
        }
      }

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json();
        setError(data.error || "保存に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-16 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface-card border border-white/10 rounded-xl shadow-xl w-full max-w-2xl mx-4 mb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">顧客情報を編集</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
        {/* タブ */}
        <div className="flex gap-1 px-4 pt-3 border-b border-white/10">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-sm rounded-t-lg transition-colors ${
                activeTab === tab.key ? "bg-surface-elevated text-white border-b-2 border-brand" : "text-gray-400 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* フィールド */}
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {EDITABLE_FIELDS[activeTab].map((field) => (
            <div key={field.key}>
              <label className="text-xs text-gray-400 block mb-1">{field.label}</label>
              {field.type === "textarea" ? (
                <textarea
                  value={formData[activeTab]?.[field.key] ?? ""}
                  onChange={(e) => handleChange(activeTab, field.key, e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand resize-none"
                />
              ) : field.type === "select" ? (
                <select
                  value={formData[activeTab]?.[field.key] ?? ""}
                  onChange={(e) => handleChange(activeTab, field.key, e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand"
                >
                  <option value="">-</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>{opt === "true" ? "はい" : opt === "false" ? "いいえ" : opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={formData[activeTab]?.[field.key] ?? ""}
                  onChange={(e) => handleChange(activeTab, field.key, e.target.value)}
                  step={field.type === "number" ? "any" : undefined}
                  className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand"
                />
              )}
            </div>
          ))}
        </div>
        {error && <p className="px-4 text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 p-4 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CustomerDetailClient({
  customer: initialCustomer,
  activities,
  emails,
  applicationHistory,
}: CustomerDetailClientProps) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailList, setEmailList] = useState(emails);
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("edit") === "true") {
      setShowEditModal(true);
    }
  }, [searchParams]);

  const handleDelete = async () => {
    if (!confirm(`「${customer.name}」を削除しますか？\n関連データ（営業・契約・学習・エージェント・フォーム履歴）もすべて削除されます。`)) return;
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

  const handleEditSaved = () => {
    setShowEditModal(false);
    window.location.reload();
  };

  const addEmail = async () => {
    if (!newEmail) return;
    setIsAddingEmail(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      if (res.ok) {
        const data = await res.json();
        setEmailList((prev) => [...prev, data]);
        setNewEmail("");
        setShowAddEmail(false);
      } else {
        const err = await res.json();
        alert(err.error || "エラーが発生しました");
      }
    } finally {
      setIsAddingEmail(false);
    }
  };
  return (
    <div className="p-4 space-y-3">
      {showEditModal && (
        <EditModal customer={customer} onClose={() => setShowEditModal(false)} onSaved={handleEditSaved} />
      )}

      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Link
          href="/customers"
          className="text-gray-400 hover:text-gray-300 transition-colors"
        >
          ← 戻る
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-brand-muted text-brand rounded-full flex items-center justify-center font-bold text-lg">
              {customer.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{customer.name}</h1>
              <div className="flex items-center gap-2 mt-1">
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
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-2 text-red-400 hover:text-red-300 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {deleting ? "削除中..." : "削除"}
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            編集
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          {/* 基本情報 */}
          <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">基本情報</h2>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <InfoRow label="申込日" value={formatDate(customer.application_date)} />
              <InfoRow label="メール" value={customer.email || "-"} />
              <InfoRow label="電話番号" value={customer.phone || "-"} />
              <InfoRow label="流入元" value={`${customer.utm_source || "-"} / ${customer.utm_medium || "-"}`} />
              <InfoRow label="大学" value={customer.university || "-"} />
              <InfoRow label="学部" value={customer.faculty || "-"} />
              <InfoRow label="優先度" value={customer.priority || "-"} />
              <InfoRow label="初期レベル" value={customer.initial_level || "-"} />
            </div>
            {customer.career_history && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 font-medium mb-1">経歴</p>
                <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-3 rounded-lg">
                  {customer.career_history}
                </p>
              </div>
            )}
            {customer.target_companies && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 font-medium mb-1">志望企業</p>
                <p className="text-sm text-gray-300 bg-surface-elevated p-3 rounded-lg">
                  {customer.target_companies}
                </p>
              </div>
            )}
          </div>

          {/* 営業・商談情報 */}
          {customer.pipeline && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">営業・商談情報</h2>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <InfoRow label="面談予定日" value={formatDate(customer.pipeline.meeting_scheduled_date)} />
                <InfoRow label="面談実施日" value={formatDate(customer.pipeline.meeting_conducted_date)} />
                <InfoRow label="営業日" value={formatDate(customer.pipeline.sales_date)} />
                <InfoRow label="成約日" value={formatDate(customer.pipeline.closing_date)} />
                <InfoRow label="入金日" value={formatDate(customer.pipeline.payment_date)} />
                <InfoRow label="エージェント希望" value={customer.pipeline.agent_interest_at_application ? "あり" : "なし"} />
                <InfoRow label="決め手" value={customer.pipeline.decision_factor || "-"} />
                <InfoRow label="比較サービス" value={customer.pipeline.comparison_services || "-"} />
              </div>
              {customer.pipeline.sales_content && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">営業内容</p>
                  <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-3 rounded-lg">
                    {customer.pipeline.sales_content}
                  </p>
                </div>
              )}
              {customer.pipeline.sales_strategy && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">営業方針</p>
                  <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-3 rounded-lg">
                    {customer.pipeline.sales_strategy}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 売上見込サマリー */}
          {(customer.contract || customer.pipeline) && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">売上見込</h2>
              <div className="space-y-3">
                {/* 売上見込の分解 */}
                <div className="bg-surface-elevated rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">確定売上（スクール）</span>
                    <span className="text-white font-medium">{customer.contract?.confirmed_amount ? formatCurrency(customer.contract.confirmed_amount) : "¥0"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">確定売上（人材）</span>
                    <span className="text-white font-medium">{isAgentConfirmed(customer) ? formatCurrency(calcExpectedReferralFee(customer)) : "¥0"}</span>
                  </div>
                  <div className="border-t border-white/10 pt-1.5 flex justify-between text-sm">
                    <span className="text-white font-semibold">確定売上 合計</span>
                    <span className="text-green-400 font-bold">{(() => { const v = calcConfirmedRevenue(customer); return v > 0 ? formatCurrency(v) : "¥0"; })()}</span>
                  </div>
                </div>
                <div className="bg-surface-elevated rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">補助金額（リスキャリ）</span>
                    <span className="text-white font-medium">{(() => { const s = getSubsidyAmount(customer); return s > 0 ? formatCurrency(s) : "¥0"; })()}{customer.contract?.subsidy_eligible ? " （対象）" : ""}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">人材見込売上</span>
                    <span className="text-white font-medium">{(() => { const v = calcAgentProjectedRevenue(customer); return v > 0 ? formatCurrency(v) : "¥0"; })()}</span>
                  </div>
                  <div className="border-t border-white/10 pt-1.5 flex justify-between text-sm">
                    <span className="text-white font-semibold">売上見込 合計</span>
                    <span className="text-brand font-bold">{(() => { const v = calcSalesProjection(customer); return v > 0 ? formatCurrency(v) : "-"; })()}</span>
                  </div>
                </div>
                {/* 見込LTV・成約見込率 */}
                <div className="grid grid-cols-3 gap-3 text-sm mt-3">
                  <InfoRow label="成約見込率" value={formatPercent(calcClosingProbability(customer))} />
                  <InfoRow label="見込LTV" value={(() => { const v = calcExpectedLTV(customer); return v > 0 ? formatCurrency(v) : "-"; })()} />
                </div>
              </div>
            </div>
          )}

          {/* 契約情報 */}
          {customer.contract && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">契約・入金情報</h2>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <InfoRow label="プラン" value={customer.contract.plan_name || "-"} />
                <InfoRow label="変更プラン" value={customer.contract.changed_plan || "-"} />
                <InfoRow label="一次金額" value={customer.contract.first_amount ? formatCurrency(customer.contract.first_amount) : "-"} />
                <InfoRow label="確定売上" value={customer.contract.confirmed_amount ? formatCurrency(customer.contract.confirmed_amount) : "-"} />
                <InfoRow label="割引" value={customer.contract.discount ? formatCurrency(customer.contract.discount) : "なし"} />
                <InfoRow label="請求状況" value={customer.contract.billing_status} />
                <InfoRow label="入金日" value={formatDate(customer.contract.payment_date)} />
                <InfoRow label="補助金対象" value={customer.contract.subsidy_eligible ? "対象" : "非対象"} />
                <InfoRow label="補助金額" value={(() => { const s = getSubsidyAmount(customer); return s > 0 ? formatCurrency(s) : "-"; })()} />
              </div>
            </div>
          )}

          {/* 学習情報 */}
          {customer.learning && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">学習状況</h2>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <InfoRow label="指導メンター" value={customer.learning.mentor_name || "-"} />
                <InfoRow label="契約月数" value={customer.learning.contract_months != null ? `${customer.learning.contract_months}ヶ月` : "-"} />
                <InfoRow label="指導開始日" value={formatDate(customer.learning.coaching_start_date)} />
                <InfoRow label="指導終了日" value={formatDate(customer.learning.coaching_end_date)} />
                <InfoRow label="最終指導日" value={formatDate(customer.learning.last_coaching_date)} />
                <InfoRow label="契約指導回数" value={customer.learning.total_sessions.toString()} />
                <InfoRow label="指導完了数" value={customer.learning.completed_sessions != null ? customer.learning.completed_sessions.toString() : "-"} />
                <InfoRow label="残指導回数" value={`${calcRemainingSessions(customer)}回`} />
                <InfoRow label="日程消化率" value={(() => { const v = calcScheduleProgress(customer); return v !== null ? formatPercent(v) : "-"; })()} />
                <InfoRow label="指導消化率" value={(() => { const v = calcSessionProgress(customer); return v !== null ? formatPercent(v) : "-"; })()} />
                <InfoRow label="進捗ステータス" value={calcProgressStatus(customer)} />
                <InfoRow label="現在のレベル" value={customer.learning.current_level || "-"} />
                <InfoRow label="フェルミ" value={customer.learning.level_fermi || "-"} />
                <InfoRow label="ケース" value={customer.learning.level_case || "-"} />
                <InfoRow label="McK" value={customer.learning.level_mck || "-"} />
                <InfoRow label="カリキュラム進捗" value={customer.learning.curriculum_progress !== null ? formatPercent(customer.learning.curriculum_progress) : "-"} />
                <InfoRow label="最新評価" value={customer.learning.latest_evaluation || "-"} />
              </div>
              {customer.learning.case_interview_progress && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">ケース面接対策状況</p>
                  <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-3 rounded-lg">
                    {customer.learning.case_interview_progress}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* エージェント情報（新卒・非エージェントユーザーは非表示） */}
          {customer.agent && customer.attribute !== "新卒" && isAgentCustomer(customer) && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">エージェント・転職支援</h2>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <InfoRow label="エージェント利用" value={isAgentCustomer(customer) ? "利用中" : "なし"} />
                <InfoRow label="プラン" value={customer.agent.agent_plan || "-"} />
                <InfoRow label="転職活動状況" value={customer.agent.job_search_status} />
                <InfoRow label="選考状況" value={customer.agent.selection_status || "-"} />
                <InfoRow label="内定先" value={customer.agent.offer_company || "-"} />
                <InfoRow label="想定年収" value={customer.agent.offer_salary ? formatCurrency(customer.agent.offer_salary) : "-"} />
                <InfoRow label="入社至る率" value={customer.agent.hire_rate != null ? formatPercent(customer.agent.hire_rate) : "-"} />
                <InfoRow label="内定確度" value={customer.agent.offer_probability != null ? formatPercent(customer.agent.offer_probability) : "-"} />
                <InfoRow label="紹介料率" value={customer.agent.referral_fee_rate ? formatPercent(customer.agent.referral_fee_rate) : "-"} />
                <InfoRow label="マージン" value={customer.agent.margin != null ? `${customer.agent.margin}` : "-"} />
                <InfoRow label="人材紹介報酬期待値" value={(() => { const v = calcExpectedReferralFee(customer); return v > 0 ? formatCurrency(v) : "-"; })()} />
                <InfoRow label="人材見込売上" value={(() => { const v = calcAgentProjectedRevenue(customer); return v > 0 ? formatCurrency(v) : "-"; })()} />
                <InfoRow label="人材確定" value={isAgentConfirmed(customer) ? "確定" : "未確定"} />
                <InfoRow label="入社予定日" value={formatDate(customer.agent.placement_date ?? null)} />
                <InfoRow label="外部エージェント" value={customer.agent.external_agents || "-"} />
                <InfoRow label="レベルアップ確認" value={customer.agent.level_up_confirmed || "-"} />
              </div>
              {customer.agent.agent_memo && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">エージェント業務メモ</p>
                  <p className="text-sm text-gray-300 whitespace-pre-line bg-surface-elevated p-3 rounded-lg">
                    {customer.agent.agent_memo}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右カラム */}
        <div className="space-y-3">
          {/* メールアドレス */}
          {emailList.length > 0 && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">メールアドレス</h2>
                <button
                  onClick={() => setShowAddEmail(!showAddEmail)}
                  className="text-xs text-brand hover:underline"
                >
                  + 追加
                </button>
              </div>
              <div className="space-y-2">
                {emailList.map((em) => (
                  <div key={em.id} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-300">{em.email}</span>
                    {em.is_primary && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-brand/20 text-brand rounded">メイン</span>
                    )}
                  </div>
                ))}
              </div>
              {showAddEmail && (
                <div className="flex gap-2 mt-3">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="新しいメールアドレス"
                    className="flex-1 px-2 py-1.5 bg-surface-elevated border border-white/10 rounded text-white text-sm focus:outline-none focus:border-brand"
                  />
                  <button
                    onClick={addEmail}
                    disabled={!newEmail || isAddingEmail}
                    className="px-3 py-1.5 bg-brand text-white rounded text-xs disabled:opacity-50"
                  >
                    {isAddingEmail ? "..." : "追加"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* フォームデータ（ソース別タブ表示） */}
          {applicationHistory.length > 0 && (
            <FormDataSection records={applicationHistory} />
          )}

          <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">プロフィール</h2>
            <div className="space-y-3 text-sm">
              {customer.sns_accounts && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">SNS</p>
                  <p className="text-gray-300">{customer.sns_accounts}</p>
                </div>
              )}
              {customer.reference_media && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">参考メディア</p>
                  <p className="text-gray-300">{customer.reference_media}</p>
                </div>
              )}
              {customer.hobbies && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">趣味・特技</p>
                  <p className="text-gray-300">{customer.hobbies}</p>
                </div>
              )}
              {customer.behavioral_traits && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">行動特性</p>
                  <p className="text-gray-300">{customer.behavioral_traits}</p>
                </div>
              )}
              {customer.notes && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">備考</p>
                  <p className="text-gray-300 bg-yellow-900/20 p-2 rounded">{customer.notes}</p>
                </div>
              )}
              {customer.caution_notes && (
                <div>
                  <p className="text-xs text-gray-500 font-medium">注意事項</p>
                  <p className="text-gray-300 bg-red-900/20 p-2 rounded">{customer.caution_notes}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">活動履歴</h2>
              <button className="text-xs text-brand hover:underline">
                + 追加
              </button>
            </div>
            <div className="space-y-4">
              {activities.length === 0 && (
                <p className="text-sm text-gray-400">活動履歴がありません</p>
              )}
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="border-l-2 border-brand/30 pl-3 py-1"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium bg-surface-elevated text-gray-300 px-2 py-0.5 rounded">
                      {activity.activity_type}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(activity.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{activity.content}</p>
                  {activity.created_by && (
                    <p className="text-xs text-gray-400 mt-1">
                      担当: {activity.created_by}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
