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

interface OtherRevenuesClientProps {
  initialData: RevenueEntry[];
}

// ================================================================
// カテゴリ定義
// ================================================================

const CATEGORIES = [
  { key: "note", label: "note売上", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { key: "myvision", label: "MyVision受託", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { key: "other", label: "その他", color: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
];

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

// ================================================================
// メインコンポーネント
// ================================================================

export function OtherRevenuesClient({ initialData }: OtherRevenuesClientProps) {
  const [entries, setEntries] = useState(initialData);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  // 月別サマリー
  const monthlySummary = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const e of entries) {
      const month = e.revenue_date.substring(0, 7); // YYYY-MM
      if (!map[month]) map[month] = {};
      map[month][e.category] = (map[month][e.category] || 0) + e.amount;
    }
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12)
      .map(([month, cats]) => ({
        month,
        ...cats,
        total: Object.values(cats).reduce((s, v) => s + v, 0),
      }));
  }, [entries]);

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
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("この売上データを削除しますか？")) return;
    const res = await fetch(`/api/other-revenues/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  }, []);

  // カテゴリ別合計
  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of entries) {
      map[e.category] = (map[e.category] || 0) + e.amount;
    }
    return map;
  }, [entries]);

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
        <button
          onClick={() => {
            if (showAddForm) resetForm();
            else setShowAddForm(true);
          }}
          className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors"
        >
          {showAddForm ? "キャンセル" : "+ 売上を追加"}
        </button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CATEGORIES.map((cat) => (
          <div key={cat.key} className="bg-surface-card border border-white/10 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 font-medium uppercase">{cat.label}</p>
            <p className="text-xl font-bold text-white mt-1">
              {formatCurrency(categoryTotals[cat.key] || 0)}
            </p>
            <p className="text-[10px] text-gray-600 mt-0.5">
              {entries.filter((e) => e.category === cat.key).length}件
            </p>
          </div>
        ))}
        <div className="bg-surface-card border border-white/10 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 font-medium uppercase">合計</p>
          <p className="text-xl font-bold text-brand mt-1">
            {formatCurrency(Object.values(categoryTotals).reduce((s, v) => s + v, 0))}
          </p>
          <p className="text-[10px] text-gray-600 mt-0.5">{entries.length}件</p>
        </div>
      </div>

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

      {/* 月別サマリー */}
      {monthlySummary.length > 0 && (
        <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <h3 className="text-sm font-semibold text-gray-400">月別サマリー</h3>
          </div>
          <table className="w-full">
            <thead className="bg-surface-elevated">
              <tr>
                <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500">月</th>
                {CATEGORIES.map((c) => (
                  <th key={c.key} className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500">{c.label}</th>
                ))}
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500">合計</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.map((row) => (
                <tr key={row.month} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                  <td className="py-2.5 px-4 text-sm text-white font-medium">{row.month}</td>
                  {CATEGORIES.map((c) => (
                    <td key={c.key} className="py-2.5 px-4 text-sm text-gray-300 text-right">
                      {(row as unknown as Record<string, number>)[c.key] ? formatCurrency((row as unknown as Record<string, number>)[c.key]) : "-"}
                    </td>
                  ))}
                  <td className="py-2.5 px-4 text-sm text-white font-semibold text-right">
                    {formatCurrency(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
