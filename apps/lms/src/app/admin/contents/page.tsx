"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Pencil, Trash2, Plus, Check, X, Shield } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  slug: string;
}

interface Content {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  target_attribute: string | null;
  status: string;
  sort_order: number;
  plan_ids: string[];
  lesson_count: number;
}

const CATEGORIES = ["教科書", "動画講座", "補助教材", "ガイド"];

export default function ContentsAdminPage() {
  const [contents, setContents] = useState<Content[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlanIds, setEditPlanIds] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("教科書");
  const [newTarget, setNewTarget] = useState("既卒");
  const [filter, setFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    const [contentsRes, plansRes] = await Promise.all([
      fetch("/api/admin/contents"),
      fetch("/api/plans"),
    ]);
    if (contentsRes.ok) setContents(await contentsRes.json());
    if (plansRes.ok) setPlans(await plansRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const res = await fetch("/api/admin/contents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle,
        category: newCategory,
        target_attribute: newTarget,
        status: "published",
      }),
    });
    if (res.ok) {
      setNewTitle("");
      setShowCreate(false);
      fetchData();
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    const res = await fetch(`/api/admin/contents/${id}`, { method: "DELETE" });
    if (res.ok) setContents((prev) => prev.filter((c) => c.id !== id));
  };

  const startEditPlans = (content: Content) => {
    setEditingId(content.id);
    setEditPlanIds([...content.plan_ids]);
  };

  const togglePlan = (planId: string) => {
    setEditPlanIds((prev) =>
      prev.includes(planId) ? prev.filter((p) => p !== planId) : [...prev, planId]
    );
  };

  const savePlans = async () => {
    if (!editingId) return;
    await fetch(`/api/admin/contents/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_ids: editPlanIds }),
    });
    setContents((prev) =>
      prev.map((c) => (c.id === editingId ? { ...c, plan_ids: editPlanIds } : c))
    );
    setEditingId(null);
  };

  const filtered = filter === "all"
    ? contents
    : contents.filter((c) => c.category === filter);

  if (loading) return <div className="p-6 text-gray-400">読み込み中...</div>;

  return (
    <div className="p-6 bg-surface min-h-screen space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">教材管理</h1>
          <p className="text-sm text-gray-400 mt-1">{contents.length}件の教材</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          教材を追加
        </button>
      </div>

      {/* 新規作成フォーム */}
      {showCreate && (
        <div className="bg-surface-card border border-white/10 rounded-xl p-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">教材名</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="例: ケース面接の教科書"
              className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">カテゴリ</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">対象</label>
            <select
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm"
            >
              <option value="既卒">既卒</option>
              <option value="新卒">新卒</option>
            </select>
          </div>
          <button onClick={handleCreate} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
            追加
          </button>
        </div>
      )}

      {/* フィルタ */}
      <div className="flex gap-2">
        {["all", ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === c ? "bg-brand text-white" : "bg-surface-elevated text-gray-400 hover:text-white"
            }`}
          >
            {c === "all" ? "すべて" : c}
            <span className="ml-1 opacity-70">
              {c === "all" ? contents.length : contents.filter((x) => x.category === c).length}
            </span>
          </button>
        ))}
      </div>

      {/* 教材テーブル */}
      <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-elevated border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">教材名</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">カテゴリ</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">対象</th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500">レッスン数</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">プランアクセス</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((content) => (
              <tr key={content.id} className="border-b border-white/[0.06] hover:bg-white/[0.02]">
                <td className="py-3 px-4 text-sm text-white font-medium">
                  <Link href={`/admin/contents/${content.id}`} className="hover:text-brand transition-colors">
                    {content.title}
                  </Link>
                </td>
                <td className="py-3 px-4">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">
                    {content.category || "-"}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-gray-300">{content.target_attribute || "-"}</td>
                <td className="py-3 px-4 text-sm text-center text-gray-300">{content.lesson_count}</td>
                <td className="py-3 px-4">
                  {editingId === content.id ? (
                    <div className="flex flex-wrap gap-1 items-center">
                      {plans.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => togglePlan(p.id)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                            editPlanIds.includes(p.id)
                              ? "bg-brand/20 border-brand text-brand"
                              : "bg-white/5 border-white/10 text-gray-500"
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                      <button onClick={savePlans} className="p-1 text-green-400 hover:bg-green-400/10 rounded">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-white/10 rounded">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {content.plan_ids.length === 0 ? (
                        <span className="text-xs text-gray-500">未設定</span>
                      ) : (
                        content.plan_ids.map((pid) => {
                          const plan = plans.find((p) => p.id === pid);
                          return (
                            <span key={pid} className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                              {plan?.name || pid.slice(0, 8)}
                            </span>
                          );
                        })
                      )}
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => startEditPlans(content)}
                      className="p-2 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                      title="プラン設定"
                    >
                      <Shield className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(content.id, content.title)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
