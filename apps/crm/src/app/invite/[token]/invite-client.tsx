"use client";

import { useState } from "react";

interface InviteClientProps {
  token: string;
  email: string;
  displayName: string | null;
  role: string;
}

function roleLabel(role: string): string {
  switch (role) {
    case "admin": return "管理者";
    case "mentor": return "メンター";
    default: return role;
  }
}

export function InviteClient({ token, email, displayName, role }: InviteClientProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください");
      return;
    }

    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/users/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "エラーが発生しました");
        return;
      }

      setSuccess(true);
    } catch {
      setError("エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="bg-surface-card border border-white/10 rounded-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">アカウント作成完了</h1>
          <p className="text-sm text-gray-400 mb-6">
            アカウントが正常に作成されました。ログインページからサインインできます。
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
          >
            ログインページへ
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="bg-surface-card border border-white/10 rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-white mb-2">Strategists CRM に参加</h1>
          <p className="text-sm text-gray-400">
            パスワードを設定してアカウントを作成してください。
          </p>
        </div>

        <div className="mb-6 p-4 bg-surface-elevated rounded-lg border border-white/10">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">メール</span>
              <span className="text-white">{email}</span>
            </div>
            {displayName && (
              <div className="flex justify-between">
                <span className="text-gray-400">表示名</span>
                <span className="text-white">{displayName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">ロール</span>
              <span className="text-brand">{roleLabel(role)}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              パスワード <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8文字以上"
              required
              minLength={8}
              className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              パスワード（確認） <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="もう一度入力"
              required
              minLength={8}
              className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-2.5 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "作成中..." : "アカウント作成"}
          </button>
        </form>
      </div>
    </div>
  );
}
