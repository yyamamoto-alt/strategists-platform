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
    <div className="p-6 bg-gray-950 min-h-screen">
      <div className="mb-6"><h1 className="text-2xl font-bold text-white">設定</h1><p className="text-sm text-gray-400 mt-1">プロフィール情報の管理</p></div>
      <form onSubmit={(e) => { e.preventDefault(); setSaved(true); setTimeout(() => setSaved(false), 2000); }} className="max-w-xl space-y-5">
        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white mb-4">プロフィール</h2>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">名前</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">メールアドレス</label><input type="email" value={user?.email || ""} disabled className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-500 text-sm cursor-not-allowed" /></div>
          <div><label className="block text-sm font-medium text-gray-300 mb-1">ロール</label><div className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg"><span className="text-sm text-primary-400 font-medium">{roleLabels[role || ""] || "未設定"}</span></div></div>
        </div>
        <button type="submit" className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"><Save className="w-4 h-4" />{saved ? "保存しました" : "保存"}</button>
      </form>
    </div>
  );
}
