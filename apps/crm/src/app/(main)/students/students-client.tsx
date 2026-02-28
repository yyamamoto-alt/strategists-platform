"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";

interface Student {
  id: string;
  user_id: string;
  email: string;
  role: string;
  customer_id: string | null;
  customer_name: string | null;
  created_at: string;
}

interface CustomerOption {
  id: string;
  name: string;
  email: string | null;
}

interface StudentsClientProps {
  students: Student[];
  customers: CustomerOption[];
}

export function StudentsClient({ students, customers }: StudentsClientProps) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [createdAccount, setCreatedAccount] = useState<{ email: string; password: string } | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setCreatedAccount(null);

    try {
      const res = await fetch("/api/students/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          customer_id: customerId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }
      setMessage({ type: "success", text: data.message });
      setCreatedAccount({ email, password });
      setEmail("");
      setPassword("");
      setCustomerId("");
    } catch {
      setMessage({ type: "error", text: "エラーが発生しました" });
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let pass = "";
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pass);
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case "admin": return "管理者";
      case "mentor": return "メンター";
      case "student": return "受講生";
      default: return role;
    }
  };

  const roleColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-red-100 text-red-800";
      case "mentor": return "bg-blue-100 text-blue-800";
      case "student": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">LMSアカウント管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            学習者のログインアカウントを管理 / {students.length}件
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showForm ? "閉じる" : "新規アカウント作成"}
        </button>
      </div>

      {/* 作成フォーム */}
      {showForm && (
        <div className="bg-surface-card border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">学習者アカウント作成</h2>
          <form onSubmit={handleCreate} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">メールアドレス *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                required
                className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">パスワード *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8文字以上"
                  required
                  minLength={8}
                  className="flex-1 px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <button
                  type="button"
                  onClick={generatePassword}
                  className="px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-gray-300 text-sm hover:bg-white/5 transition-colors whitespace-nowrap"
                >
                  自動生成
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">顧客と紐付け（任意）</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">紐付けなし</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email || "メールなし"})
                  </option>
                ))}
              </select>
            </div>

            {message && (
              <div className={`p-3 rounded-lg text-sm ${
                message.type === "success"
                  ? "bg-green-500/10 border border-green-500/20 text-green-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}>
                {message.text}
              </div>
            )}

            {createdAccount && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm font-medium text-blue-400 mb-2">作成されたアカウント情報（受講生に共有してください）</p>
                <div className="space-y-1 text-sm text-gray-300 font-mono">
                  <p>メール: {createdAccount.email}</p>
                  <p>パスワード: {createdAccount.password}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "作成中..." : "アカウント作成"}
            </button>
          </form>
        </div>
      )}

      {/* アカウント一覧 */}
      <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-elevated border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">メールアドレス</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ロール</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">紐付け顧客</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">作成日</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-sm text-gray-500">
                  アカウントがありません
                </td>
              </tr>
            )}
            {students.map((s) => (
              <tr key={s.id} className="border-b border-white/[0.08] hover:bg-white/5">
                <td className="py-3 px-4 text-sm text-white">{s.email}</td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColor(s.role)}`}>
                    {roleLabel(s.role)}
                  </span>
                </td>
                <td className="py-3 px-4 text-sm text-gray-300">{s.customer_name || "-"}</td>
                <td className="py-3 px-4 text-sm text-gray-400">{formatDate(s.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
