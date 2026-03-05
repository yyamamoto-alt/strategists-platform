"use client";

import { useState } from "react";

interface InviteClientProps {
  token: string;
  email: string;
  displayName: string | null;
}

export function InviteClient({ token, email, displayName }: InviteClientProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

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
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "エラーが発生しました");
        return;
      }

      // 自動ログイン成功 or ログインページへリダイレクト
      window.location.href = data.redirect || "/courses";
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md px-6">
      <div className="bg-surface-card border border-white/10 rounded-2xl shadow-[0_8px_25px_rgba(0,0,0,0.5)] p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">アカウント作成</h1>
          <p className="text-gray-400">
            {displayName ? (
              <><span className="text-white font-medium">{displayName}</span> 様</>
            ) : (
              "パスワードを設定してください"
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full px-4 py-2.5 bg-surface border border-white/10 rounded-lg text-gray-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              パスワード
            </label>
            <input
              type="password"
              placeholder="8文字以上"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-2.5 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              パスワード（確認）
            </label>
            <input
              type="password"
              placeholder="もう一度入力"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-2.5 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-brand hover:bg-brand-dark text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "作成中..." : "アカウントを作成"}
          </button>
        </form>
      </div>
    </div>
  );
}
