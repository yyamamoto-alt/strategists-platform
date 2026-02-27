"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCoursePage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", description: "", category: "", level: "beginner", duration_weeks: 12 });

  return (
    <div className="p-6 bg-gray-950 min-h-screen">
      <Link href="/courses" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors"><ArrowLeft className="w-4 h-4" />コース一覧に戻る</Link>
      <h1 className="text-2xl font-bold text-white mb-6">新規コース作成</h1>
      <form onSubmit={(e) => { e.preventDefault(); router.push("/courses"); }} className="max-w-2xl space-y-5">
        <div><label className="block text-sm font-medium text-gray-300 mb-1">コース名 <span className="text-red-400">*</span></label><input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500" placeholder="例: ケース面接基礎講座" /></div>
        <div><label className="block text-sm font-medium text-gray-300 mb-1">説明</label><textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500" placeholder="コースの概要を記入..." /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-300 mb-1">カテゴリ</label><input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">レベル</label><select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"><option value="beginner">初級</option><option value="intermediate">中級</option><option value="advanced">上級</option></select></div>
        </div>
        <button type="submit" className="w-full bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">コースを作成</button>
      </form>
    </div>
  );
}
