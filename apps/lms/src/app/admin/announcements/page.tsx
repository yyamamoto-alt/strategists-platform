"use client";

import { useEffect, useState, useCallback } from "react";
import type { AnnouncementPriority } from "@strategy-school/shared-db";

interface Plan {
  id: string;
  name: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  published_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  target_plan_ids: string[];
}

const priorityOptions: { value: AnnouncementPriority; label: string; color: string }[] = [
  { value: "low", label: "低", color: "bg-gray-700 text-gray-300" },
  { value: "normal", label: "通常", color: "bg-brand-muted text-brand-light" },
  { value: "high", label: "高", color: "bg-orange-900/50 text-orange-300" },
  { value: "urgent", label: "緊急", color: "bg-red-900/50 text-red-300" },
];

function PriorityBadge({ priority }: { priority: AnnouncementPriority }) {
  const opt = priorityOptions.find((o) => o.value === priority) || priorityOptions[1];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${opt.color}`}>
      {opt.label}
    </span>
  );
}

function PrioritySelector({
  value,
  onChange,
}: {
  value: AnnouncementPriority;
  onChange: (v: AnnouncementPriority) => void;
}) {
  return (
    <div className="flex gap-2">
      {priorityOptions.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            value === opt.value
              ? `${opt.color} border-white/20`
              : "border-white/10 text-gray-500 hover:text-gray-300"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formPriority, setFormPriority] = useState<AnnouncementPriority>("normal");
  const [formPublishedAt, setFormPublishedAt] = useState("");
  const [formTargetPlanIds, setFormTargetPlanIds] = useState<string[]>([]);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const [annRes, plansRes] = await Promise.all([
        fetch("/api/admin/announcements"),
        fetch("/api/plans"),
      ]);
      if (annRes.ok) setAnnouncements(await annRes.json());
      if (plansRes.ok) setPlans(await plansRes.json());
    } catch (err) {
      console.error("Failed to fetch announcements:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormPriority("normal");
    setFormPublishedAt("");
    setFormTargetPlanIds([]);
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setFormTitle(a.title);
    setFormContent(a.content);
    setFormPriority(a.priority);
    setFormPublishedAt(
      a.published_at
        ? new Date(a.published_at).toISOString().slice(0, 16)
        : ""
    );
    setFormTargetPlanIds(a.target_plan_ids || []);
    setShowForm(false);
  };

  const toggleTargetPlan = (planId: string) => {
    setFormTargetPlanIds((prev) =>
      prev.includes(planId) ? prev.filter((p) => p !== planId) : [...prev, planId]
    );
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          content: formContent,
          priority: formPriority,
          published_at: formPublishedAt || undefined,
          target_plan_ids: formTargetPlanIds,
        }),
      });
      if (res.ok) {
        resetForm();
        await fetchAnnouncements();
      }
    } catch (err) {
      console.error("Failed to create:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !formTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/announcements/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          content: formContent,
          priority: formPriority,
          published_at: formPublishedAt || undefined,
          target_plan_ids: formTargetPlanIds,
        }),
      });
      if (res.ok) {
        resetForm();
        await fetchAnnouncements();
      }
    } catch (err) {
      console.error("Failed to update:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeletingId(null);
        await fetchAnnouncements();
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const isFormMode = showForm || editingId;

  return (
    <div className="p-6 bg-surface min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">お知らせ管理</h1>
          <p className="text-sm text-gray-400 mt-1">
            お知らせの作成・編集・削除
          </p>
        </div>
        {!isFormMode && (
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="px-4 py-2 bg-brand hover:bg-brand/80 text-white text-sm rounded-lg transition-colors"
          >
            新規作成
          </button>
        )}
      </div>

      {/* Inline Form (create / edit) */}
      {isFormMode && (
        <div className="mb-6 bg-surface-card rounded-xl border border-white/10 p-5">
          <h2 className="text-lg font-semibold text-white mb-4">
            {editingId ? "お知らせ編集" : "新規お知らせ"}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                タイトル
              </label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="お知らせのタイトル"
                className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand/50"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">内容</label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="お知らせの内容"
                rows={4}
                className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand/50 resize-y"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                優先度
              </label>
              <PrioritySelector
                value={formPriority}
                onChange={setFormPriority}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                対象プラン（未選択で全員に表示）
              </label>
              <div className="flex flex-wrap gap-1.5">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleTargetPlan(p.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      formTargetPlanIds.includes(p.id)
                        ? "bg-brand/20 border-brand text-brand-light"
                        : "border-white/10 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                公開日時（空欄で即時公開）
              </label>
              <input
                type="datetime-local"
                value={formPublishedAt}
                onChange={(e) => setFormPublishedAt(e.target.value)}
                className="px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand/50"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={editingId ? handleUpdate : handleCreate}
                disabled={saving || !formTitle.trim()}
                className="px-4 py-2 bg-brand hover:bg-brand/80 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
              >
                {saving
                  ? "保存中..."
                  : editingId
                    ? "更新する"
                    : "作成する"}
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-sm rounded-lg transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Announcements List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">読み込み中...</div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          お知らせはありません
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className={`bg-surface-card rounded-xl border border-white/10 p-4 ${
                !a.is_active ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <PriorityBadge priority={a.priority} />
                    {!a.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">
                        削除済
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      {a.published_at
                        ? new Date(a.published_at).toLocaleString("ja-JP")
                        : "未設定"}
                    </span>
                  </div>
                  <h3 className="text-white font-medium">{a.title}</h3>
                  {a.target_plan_ids && a.target_plan_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {a.target_plan_ids.map((pid) => {
                        const plan = plans.find((p) => p.id === pid);
                        return (
                          <span key={pid} className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                            {plan?.name || pid.slice(0, 8)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {a.content && (
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2 whitespace-pre-wrap">
                      {a.content}
                    </p>
                  )}
                </div>
                {a.is_active && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(a)}
                      className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors"
                    >
                      編集
                    </button>
                    {deletingId === a.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="px-3 py-1.5 text-xs bg-red-900/50 hover:bg-red-900/70 text-red-300 rounded-lg transition-colors"
                        >
                          削除する
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg transition-colors"
                        >
                          戻る
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(a.id)}
                        className="px-3 py-1.5 text-xs bg-white/5 hover:bg-red-900/30 text-gray-400 hover:text-red-300 rounded-lg transition-colors"
                      >
                        削除
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
