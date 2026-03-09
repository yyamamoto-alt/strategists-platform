"use client";

import { useEffect, useState } from "react";

interface Mentor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  slack_user_id: string | null;
  booking_url: string | null;
  profile_text: string | null;
  is_active: boolean;
}

export default function MentorsAdminPage() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Mentor>>({});
  const [saving, setSaving] = useState(false);

  const fetchMentors = async () => {
    const res = await fetch("/api/admin/mentors");
    if (res.ok) {
      const data = await res.json();
      setMentors(data);
    }
    setLoading(false);
  };

  useEffect(() => { fetchMentors(); }, []);

  const startEdit = (m: Mentor) => {
    setEditingId(m.id);
    setForm({ ...m });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const res = await fetch(`/api/admin/mentors/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setEditingId(null);
      setForm({});
      await fetchMentors();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">メンター管理</h1>
        <span className="text-xs text-gray-500">{mentors.length} 名</span>
      </div>

      <div className="space-y-3">
        {mentors.map((m) => (
          <div key={m.id} className="border border-white/10 rounded-lg bg-surface-elevated p-4">
            {editingId === m.id ? (
              // 編集モード
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">名前</label>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      value={form.name || ""}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">メールアドレス</label>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      value={form.email || ""}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="mentor@example.com"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">電話番号</label>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      value={form.phone || ""}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="090-XXXX-XXXX"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Slack ユーザーID</label>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      value={form.slack_user_id || ""}
                      onChange={(e) => setForm({ ...form, slack_user_id: e.target.value })}
                      placeholder="U01XXXXXXXX"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 block mb-1">予約URL</label>
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      value={form.booking_url || ""}
                      onChange={(e) => setForm({ ...form, booking_url: e.target.value })}
                      placeholder="https://calendly.com/..."
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 block mb-1">プロフィール / メモ</label>
                    <textarea
                      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white min-h-[80px]"
                      value={form.profile_text || ""}
                      onChange={(e) => setForm({ ...form, profile_text: e.target.value })}
                      placeholder="受講生向けの紹介文やメモ"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.is_active ?? true}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="rounded"
                    />
                    アクティブ
                  </label>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    {saving ? "保存中..." : "保存"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-300 text-sm rounded-lg"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              // 表示モード
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{m.name}</span>
                    {!m.is_active && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-600 text-gray-300 rounded">非アクティブ</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    {m.email && <span>mail: {m.email}</span>}
                    {m.phone && <span>tel: {m.phone}</span>}
                    {m.slack_user_id && <span>Slack: {m.slack_user_id}</span>}
                    {m.booking_url && (
                      <a href={m.booking_url} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">
                        予約URL
                      </a>
                    )}
                  </div>
                  {m.profile_text && (
                    <p className="text-xs text-gray-500 mt-1">{m.profile_text}</p>
                  )}
                  {!m.email && !m.phone && !m.booking_url && (
                    <p className="text-xs text-yellow-500/70">未設定 - 編集して連絡先を追加してください</p>
                  )}
                </div>
                <button
                  onClick={() => startEdit(m)}
                  className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg shrink-0"
                >
                  編集
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
