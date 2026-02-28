"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (useMock) {
      router.push("/courses");
    }
  }, [useMock, router]);

  if (useMock) {
    return <div className="min-h-screen bg-surface flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "ログインに失敗しました");
        return;
      }

      window.location.href = "/courses";
    } catch {
      setError("ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md px-6">
      <div className="bg-surface-card border border-white/10 rounded-2xl shadow-[0_8px_25px_rgba(0,0,0,0.5)] p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">ログイン</h1>
          <p className="text-gray-400">アカウントにログインしてください</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">メールアドレス</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">パスワード</label>
            <input
              type="password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-brand hover:bg-brand-dark text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
        <div className="mt-6 text-center space-y-3">
          <p className="text-gray-400 text-sm">アカウントをお持ちでない方 <Link href="/register" className="text-brand-light hover:text-brand-light font-medium">新規登録</Link></p>
          <p className="text-gray-400 text-sm">入塾をご希望の方 <Link href="/apply" className="text-brand-light hover:text-brand-light font-medium">申請はこちら</Link></p>
        </div>
      </div>
    </div>
  );
}
