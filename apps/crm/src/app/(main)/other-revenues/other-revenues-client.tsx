"use client";

import { useState, useMemo, useCallback } from "react";

// ================================================================
// 型定義
// ================================================================

interface RevenueEntry {
  id: string;
  category: string;
  title: string;
  amount: number;
  revenue_date: string;
  description: string | null;
  created_at: string;
}

interface NoteOrder {
  id: string;
  amount: number | null;
  paid_at: string | null;
  contact_name: string | null;
  product_name: string | null;
  order_type: string | null;
  source_record_id: string | null;
  created_at: string | null;
}

interface OtherRevenuesClientProps {
  initialData: RevenueEntry[];
  noteOrders: NoteOrder[];
}

// ================================================================
// カテゴリ定義
// ================================================================

const CATEGORIES = [
  { key: "note", label: "note売上", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { key: "myvision", label: "MyVision受託", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { key: "other", label: "その他", color: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
];

const ORDER_TYPE_LABELS: Record<string, string> = {
  note_textbook: "教科書",
  note_magazine: "マガジン",
  note_video: "動画講座",
};

function getCategoryMeta(key: string) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[2];
}

function formatCurrency(v: number): string {
  return `¥${v.toLocaleString()}`;
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

type TabKey = "other-revenues" | "note-orders" | "trends";

// ================================================================
// 月別集計ヘルパー
// ================================================================

function getLast12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function aggregateMonthly(items: { date: string | null; amount: number }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) {
    if (!item.date) continue;
    const month = item.date.substring(0, 7);
    map[month] = (map[month] || 0) + item.amount;
  }
  return map;
}

// ================================================================
// CSSバーチャートコンポーネント
// ================================================================

function BarChart({ data, color, label }: { data: { month: string; value: number }[]; color: string; label: string }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-surface-card border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-white">{label} 月次推移</h4>
        <span className="text-xs text-gray-400">過去12ヶ月合計: {formatCurrency(total)}</span>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: "200px" }}>
        {data.map((d) => {
          const heightPct = maxValue > 0 ? (d.value / maxValue) * 100 : 0;
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              {/* ツールチップ */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 border border-white/20 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                  {d.month}: {formatCurrency(d.value)}
                </div>
              </div>
              {/* バー */}
              <div
                className="w-full rounded-t transition-all duration-300"
                style={{
                  height: `${Math.max(heightPct, d.value > 0 ? 2 : 0)}%`,
                  backgroundColor: color,
                  minHeight: d.value > 0 ? "4px" : "0px",
                  opacity: d.value > 0 ? 1 : 0.15,
                }}
              />
              {/* 月ラベル */}
              <span className="text-[9px] text-gray-500 mt-1.5 leading-none">
                {d.month.split("-")[1]}月
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================================================================
// メインコンポーネント
// ================================================================

export function OtherRevenuesClient({ initialData, noteOrders }: OtherRevenuesClientProps) {
  const [entries, setEntries] = useState(initialData);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("other-revenues");

  // フォーム
  const [formCategory, setFormCategory] = useState("note");
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    if (filterCategory === "all") return entries;
    return entries.filter((e) => e.category === filterCategory);
  }, [entries, filterCategory]);

  const resetForm = useCallback(() => {
    setFormCategory("note");
    setFormTitle("");
    setFormAmount("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormDescription("");
    setShowAddForm(false);
    setEditingId(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formTitle.trim() || !formAmount || !formDate) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/other-revenues/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: formCategory,
            title: formTitle,
            amount: Number(formAmount),
            revenue_date: formDate,
            description: formDescription || null,
          }),
        });
        if (res.ok) {
          const updated = await res.json();
          setEntries((prev) => prev.map((e) => (e.id === editingId ? updated : e)));
          resetForm();
        }
      } else {
        const res = await fetch("/api/other-revenues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: formCategory,
            title: formTitle,
            amount: Number(formAmount),
            revenue_date: formDate,
            description: formDescription || null,
          }),
        });
        if (res.ok) {
          const newEntry = await res.json();
          setEntries((prev) => [newEntry, ...prev]);
          resetForm();
        }
      }
    } finally {
      setSaving(false);
    }
  }, [editingId, formCategory, formTitle, formAmount, formDate, formDescription, resetForm]);

  const handleEdit = useCallback((entry: RevenueEntry) => {
    setEditingId(entry.id);
    setFormCategory(entry.category);
    setFormTitle(entry.title);
    setFormAmount(entry.amount.toString());
    setFormDate(entry.revenue_date);
    setFormDescription(entry.description || "");
    setShowAddForm(true);
    setActiveTab("other-revenues");
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("この売上データを削除しますか？")) return;
    const res = await fetch(`/api/other-revenues/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  }, []);

  // ================================================================
  // トレンドグラフ用データ
  // ================================================================

  const last12Months = useMemo(() => getLast12Months(), []);

  const noteMonthlyData = useMemo(() => {
    const monthly = aggregateMonthly(
      noteOrders.map((o) => ({ date: o.paid_at, amount: o.amount || 0 }))
    );
    return last12Months.map((m) => ({ month: m, value: monthly[m] || 0 }));
  }, [noteOrders, last12Months]);

  const myvisionMonthlyData = useMemo(() => {
    const myvisionEntries = entries.filter((e) => e.category === "myvision");
    const monthly = aggregateMonthly(
      myvisionEntries.map((e) => ({ date: e.revenue_date, amount: e.amount }))
    );
    return last12Months.map((m) => ({ month: m, value: monthly[m] || 0 }));
  }, [entries, last12Months]);

  // ================================================================
  // タブ定義
  // ================================================================

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "other-revenues", label: "その他売上", count: entries.length },
    { key: "note-orders", label: "note購入履歴", count: noteOrders.length },
    { key: "trends", label: "売上推移" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">その他売上管理</h1>
          <p className="text-sm text-gray-400 mt-1">
            note.comコンテンツ販売・MyVision受託事業等の売上を管理
          </p>
        </div>
        {activeTab === "other-revenues" && (
          <button
            onClick={() => {
              if (showAddForm) resetForm();
              else setShowAddForm(true);
            }}
            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors"
          >
            {showAddForm ? "キャンセル" : "+ 売上を追加"}
          </button>
        )}
      </div>

      {/* タブ */}
      <div className="flex items-center gap-1 border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.key
                ? "text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key
                  ? "bg-brand/20 text-brand"
                  : "bg-white/5 text-gray-500"
              }`}>
                {tab.count}
              </span>
            )}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* タブ: その他売上 */}
      {/* ================================================================ */}
      {activeTab === "other-revenues" && (
        <>
          {/* 追加/編集フォーム */}
          {showAddForm && (
            <div className="bg-surface-card border border-white/10 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">
                {editingId ? "売上データを編集" : "新しい売上データを追加"}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">カテゴリ</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">タイトル</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="例: ケース面接対策ノート"
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">金額(円)</label>
                  <input
                    type="number"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="50000"
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">売上日</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">メモ（任意）</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="補足情報"
                  className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formTitle.trim() || !formAmount}
                  className="px-6 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-40 transition-colors"
                >
                  {saving ? "保存中..." : editingId ? "更新" : "追加"}
                </button>
              </div>
            </div>
          )}

          {/* フィルター */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterCategory("all")}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                filterCategory === "all" ? "bg-brand text-white" : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              全て ({entries.length})
            </button>
            {CATEGORIES.map((c) => {
              const count = entries.filter((e) => e.category === c.key).length;
              return (
                <button
                  key={c.key}
                  onClick={() => setFilterCategory(c.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    filterCategory === c.key ? "bg-brand text-white" : "bg-white/5 text-gray-400 hover:text-white"
                  }`}
                >
                  {c.label} ({count})
                </button>
              );
            })}
          </div>

          {/* データ一覧 */}
          {filtered.length === 0 ? (
            <div className="bg-surface-card border border-white/10 rounded-xl p-12 text-center">
              <p className="text-gray-400">売上データがありません</p>
              <p className="text-xs text-gray-500 mt-1">「+ 売上を追加」からデータを登録してください</p>
            </div>
          ) : (
            <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-elevated border-b border-white/10">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">カテゴリ</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">タイトル</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">金額</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">売上日</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">メモ</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => {
                    const cat = getCategoryMeta(entry.category);
                    return (
                      <tr key={entry.id} className="border-b border-white/[0.06] hover:bg-white/[0.02]">
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${cat.color}`}>
                            {cat.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-white">{entry.title}</td>
                        <td className="py-3 px-4 text-sm text-white text-right font-medium">
                          {formatCurrency(entry.amount)}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-400">{formatDate(entry.revenue_date)}</td>
                        <td className="py-3 px-4 text-sm text-gray-500 max-w-48 truncate">{entry.description || "-"}</td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEdit(entry)}
                              className="px-2 py-1 text-[10px] text-gray-400 border border-white/10 rounded hover:bg-white/5 hover:text-white"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              className="px-2 py-1 text-[10px] text-red-400 border border-red-500/20 rounded hover:bg-red-500/10"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* タブ: note購入履歴 */}
      {/* ================================================================ */}
      {activeTab === "note-orders" && (
        <>
          {noteOrders.length === 0 ? (
            <div className="bg-surface-card border border-white/10 rounded-xl p-12 text-center">
              <p className="text-gray-400">note購入データがありません</p>
              <p className="text-xs text-gray-500 mt-1">ordersテーブル (source=note) にデータが存在しません</p>
            </div>
          ) : (
            <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-400">
                  note購入履歴（ordersテーブル）
                </h3>
                <span className="text-xs text-gray-500">
                  合計: {formatCurrency(noteOrders.reduce((s, o) => s + (o.amount || 0), 0))} / {noteOrders.length}件
                </span>
              </div>
              <table className="w-full">
                <thead className="bg-surface-elevated border-b border-white/10">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">購入者</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">商品名</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">種別</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">金額</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">購入日</th>
                  </tr>
                </thead>
                <tbody>
                  {noteOrders.map((order) => (
                    <tr key={order.id} className="border-b border-white/[0.06] hover:bg-white/[0.02]">
                      <td className="py-3 px-4 text-sm text-white">
                        {order.contact_name || "-"}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-300">
                        {order.product_name || "-"}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                          {order.order_type ? (ORDER_TYPE_LABELS[order.order_type] || order.order_type) : "-"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-white text-right font-medium">
                        {order.amount != null ? formatCurrency(order.amount) : "-"}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {formatDate(order.paid_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* タブ: 売上推移 */}
      {/* ================================================================ */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          <BarChart
            data={noteMonthlyData}
            color="#10b981"
            label="note売上"
          />
          <BarChart
            data={myvisionMonthlyData}
            color="#3b82f6"
            label="MyVision売上"
          />
        </div>
      )}
    </div>
  );
}
