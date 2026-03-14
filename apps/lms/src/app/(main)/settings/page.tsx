"use client";

import { useAuth } from "@/lib/auth-context";
import { User, Mail } from "lucide-react";

export default function SettingsPage() {
  const { user, role, displayName } = useAuth();

  const roleLabels: Record<string, string> = { admin: "管理者", mentor: "メンター", student: "受講生" };
  const nameDisplay = displayName || user?.email?.split("@")[0] || "未設定";

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">設定</h1>
        <p className="text-sm text-gray-400 mt-1">アカウント情報</p>
      </div>
      <div className="max-w-xl">
        <div className="bg-surface-elevated rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3 py-2 border-b border-white/[0.06]">
            <User className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 mb-0.5">名前</p>
              <p className="text-sm text-white">{nameDisplay}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-2 border-b border-white/[0.06]">
            <Mail className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 mb-0.5">メールアドレス</p>
              <p className="text-sm text-white">{user?.email || "未設定"}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-2">
            <div className="w-4 h-4 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 mb-0.5">ロール</p>
              <span className="text-sm text-brand-light font-medium">{roleLabels[role || ""] || "未設定"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
