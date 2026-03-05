"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Check, X, Shield, ExternalLink } from "lucide-react";

interface Plan {
  id: string;
  name: string;
}

interface Form {
  id: string;
  title: string;
  url: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  plan_ids: string[];
}

export default function FormsAdminPage() {
  const [forms, setForms] = useState<Form[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlanIds, setEditPlanIds] = useState<string[]>([]);
  const [editingForm, setEditingForm] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");

  const fetchData = useCallback(async () => {
    const [formsRes, plansRes] = await Promise.all([
      fetch("/api/admin/forms"),
      fetch("/api/plans"),
    ]);
    if (formsRes.ok) setForms(await formsRes.json());
    if (plansRes.ok) setPlans(await plansRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newUrl.trim()) return;
    const res = await fetch("/api/admin/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, url: newUrl }),
    });
    if (res.ok) {
      setNewTitle("");
      setNewUrl("");
      setShowCreate(false);
      fetchData();
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    const res = await fetch(`/api/admin/forms/${id}`, { method: "DELETE" });
    if (res.ok) setForms((prev) => prev.filter((f) => f.id !== id));
  };

  const startEditPlans = (form: Form) => {
    setEditingId(form.id);
    setEditPlanIds([...form.plan_ids]);
  };

  const togglePlan = (planId: string) => {
    setEditPlanIds((prev) =>
      prev.includes(planId) ? prev.filter((p) => p !== planId) : [...prev, planId]
    );
  };

  const savePlans = async () => {
    if (!editingId) return;
    await fetch(`/api/admin/forms/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_ids: editPlanIds }),
    });
    setForms((prev) =>
      prev.map((f) => (f.id === editingId ? { ...f, plan_ids: editPlanIds } : f))
    );
    setEditingId(null);
  };

  const startEditForm = (form: Form) => {
    setEditingForm(form.id);
    setEditTitle(form.title);
    setEditUrl(form.url);
  };

  const saveForm = async () => {
    if (!editingForm) return;
    await fetch(`/api/admin/forms/${editingForm}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, url: editUrl }),
    });
    setForms((prev) =>
      prev.map((f) => (f.id === editingForm ? { ...f, title: editTitle, url: editUrl } : f))
    );
    setEditingForm(null);
  };

  if (loading) return <div className="p-6 text-gray-400">読み込み中...</div>;

  return (
    <div className="p-6 bg-surface min-h-screen space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">フォーム管理</h1>
          <p className="text-sm text-gray-400 mt-1">{forms.length}件のフォーム</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          フォームを追加
        </button>
      </div>

      {showCreate && (
        <div className="bg-surface-card border border-white/10 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">フォーム名</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="例: 添削提出フォーム"
              className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://docs.google.com/forms/..."
              className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>
          <button onClick={handleCreate} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
            追加
          </button>
        </div>
      )}

      <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-elevated border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">フォーム名</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">URL</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">プランアクセス</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {forms.map((form) => (
              <tr key={form.id} className="border-b border-white/[0.06] hover:bg-white/[0.02]">
                <td className="py-3 px-4">
                  {editingForm === form.id ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="px-2 py-1 bg-surface-elevated border border-white/10 rounded text-white text-sm w-full"
                    />
                  ) : (
                    <span
                      className="text-sm text-white font-medium cursor-pointer hover:text-brand"
                      onClick={() => startEditForm(form)}
                    >
                      {form.title}
                    </span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {editingForm === form.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="url"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="px-2 py-1 bg-surface-elevated border border-white/10 rounded text-white text-sm flex-1"
                      />
                      <button onClick={saveForm} className="p-1 text-green-400 hover:bg-green-400/10 rounded">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingForm(null)} className="p-1 text-gray-400 hover:bg-white/10 rounded">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <a href={form.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-brand flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      {form.url.length > 50 ? form.url.slice(0, 50) + "..." : form.url}
                    </a>
                  )}
                </td>
                <td className="py-3 px-4">
                  {editingId === form.id ? (
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
                      {form.plan_ids.length === 0 ? (
                        <span className="text-xs text-gray-500">全プラン共通</span>
                      ) : (
                        form.plan_ids.map((pid) => {
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
                      onClick={() => startEditPlans(form)}
                      className="p-2 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                      title="プラン設定"
                    >
                      <Shield className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(form.id, form.title)}
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
