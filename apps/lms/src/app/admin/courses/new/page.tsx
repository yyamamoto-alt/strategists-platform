"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCoursePage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", description: "", category: "", level: "beginner", duration_weeks: 12 });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        const data = await res.json();
        // 作成後にコース編集ページ（モジュール/レッスン追加）へ
        router.push(`/admin/courses/${data.id}`);
      } else {
        const err = await res.json();
        alert(err.error || "コース作成に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 bg-surface min-h-screen">
      <Link href="/courses" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors"><ArrowLeft className="w-4 h-4" />コース一覧に戻る</Link>
      <h1 className="text-2xl font-bold text-white mb-6">新規コース作成</h1>
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
        <div><label className="block text-sm font-medium text-gray-300 mb-1">コース名 <span className="text-red-400">*</span></label><input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-4 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" placeholder="例: ケース面接基礎講座" /></div>
        <div><label className="block text-sm font-medium text-gray-300 mb-1">説明</label><textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-4 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" placeholder="コースの概要を記入..." /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-300 mb-1">カテゴリ</label><input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">レベル</label><select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="w-full px-4 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand"><option value="beginner">初級</option><option value="intermediate">中級</option><option value="advanced">上級</option></select></div>
        </div>
        <div><label className="block text-sm font-medium text-gray-300 mb-1">期間 (週)</label><input type="number" value={form.duration_weeks} onChange={(e) => setForm({ ...form, duration_weeks: parseInt(e.target.value) || 12 })} className="w-full px-4 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" /></div>
        <button type="submit" disabled={saving} className="w-full bg-brand hover:bg-brand-dark text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">{saving ? "作成中..." : "コースを作成"}</button>
      </form>
    </div>
  );
}
