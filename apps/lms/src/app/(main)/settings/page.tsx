"use client";

import { useAuth } from "@/lib/auth-context";
import { Save } from "lucide-react";
import { useState } from "react";

export default function SettingsPage() {
  const { user, role } = useAuth();
  const [name, setName] = useState("モックユーザー");
  const [saved, setSaved] = useState(false);

  const roleLabels: Record<string, string> = { admin: "管理者", mentor: "メンター", student: "受講生" };

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="mb-6"><h1 className="text-2xl font-bold text-white">設定</h1><p className="text-sm text-gray-400 mt-1">プロフィール情報の管理</p></div>
      <form onSubmit={(e) => { e.preventDefault(); setSaved(true); setTimeout(() => setSaved(false), 2000); }} className="max-w-xl space-y-5">
        <div className="bg-surface-elevated rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white mb-4">プロフィール</h2>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">名前</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2 bg-surface-card border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">メールアドレス</label><input type="email" value={user?.email || ""} disabled className="w-full px-4 py-2 bg-surface-card border border-white/10 rounded-lg text-gray-500 text-sm cursor-not-allowed" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">ロール</label><div className="px-4 py-2 bg-surface-card border border-white/10 rounded-lg"><span className="text-sm text-brand-light font-medium">{roleLabels[role || ""] || "未設定"}</span></div></div>
        </div>
        <button type="submit" className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"><Save className="w-4 h-4" />{saved ? "保存しました" : "保存"}</button>
      </form>
    </div>
  );
}
