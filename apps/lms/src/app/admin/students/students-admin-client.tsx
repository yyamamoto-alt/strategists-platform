"use client";

import { useState } from "react";

interface Student {
  id: string;
  user_id: string;
  email: string;
  role: string;
  customer_id: string | null;
  customer_name: string | null;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  display_name: string | null;
  token: string;
  expires_at: string;
  used_at: string | null;
  customer_id: string | null;
  created_at: string;
}

interface Props {
  students: Student[];
  invitations: Invitation[];
}

export function StudentsAdminClient({ students, invitations }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setInviteUrl(null);

    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName: displayName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }
      setMessage({ type: "success", text: "招待URLを生成しました" });
      setInviteUrl(data.invite_url);
      setEmail("");
      setDisplayName("");
    } catch {
      setMessage({ type: "error", text: "エラーが発生しました" });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("ja-JP");

  const pendingInvitations = invitations.filter((i) => !i.used_at && new Date(i.expires_at) > new Date());

  return (
    <div className="p-6 bg-surface min-h-screen space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">受講生管理</h1>
          <p className="text-sm text-gray-400 mt-1">
            アカウント {students.length}件 / 招待待ち {pendingInvitations.length}件
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setMessage(null); setInviteUrl(null); }}
          className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showForm ? "閉じる" : "招待URL生成"}
        </button>
      </div>

      {/* 招待フォーム */}
      {showForm && (
        <div className="bg-surface-card border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">受講生を招待</h2>
          <p className="text-xs text-gray-500 mb-4">メールアドレスを入力すると顧客DBから自動で紐づけます</p>
          <form onSubmit={handleInvite} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">メールアドレス *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
                required
                className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">表示名（任意）</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="顧客DBに登録があれば自動取得されます"
                className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
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

            {inviteUrl && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
                <p className="text-xs text-gray-400">受講生にこのURLを共有してください。パスワード設定でアカウントが作成されます。</p>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    readOnly
                    value={inviteUrl}
                    className="flex-1 px-3 py-2 bg-surface border border-white/10 rounded text-xs text-gray-300 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(inviteUrl)}
                    className="px-3 py-2 bg-brand/20 text-brand rounded text-xs font-medium hover:bg-brand/30 transition-colors whitespace-nowrap"
                  >
                    {copied ? "コピー済み" : "コピー"}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "生成中..." : "招待URLを生成"}
            </button>
          </form>
        </div>
      )}

      {/* 招待待ち */}
      {pendingInvitations.length > 0 && (
        <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-gray-400">招待待ち ({pendingInvitations.length}件)</h2>
          </div>
          <table className="w-full">
            <thead className="bg-surface-elevated border-b border-white/10">
              <tr>
                <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500">メール</th>
                <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500">表示名</th>
                <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500">有効期限</th>
                <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {pendingInvitations.map((inv) => {
                const url = `${window.location.origin}/invite/${inv.token}`;
                return (
                  <tr key={inv.id} className="border-b border-white/[0.08]">
                    <td className="py-2 px-4 text-sm text-white">{inv.email}</td>
                    <td className="py-2 px-4 text-sm text-gray-300">{inv.display_name || "-"}</td>
                    <td className="py-2 px-4 text-xs text-gray-400">{formatDate(inv.expires_at)}</td>
                    <td className="py-2 px-4">
                      <button
                        onClick={() => handleCopy(url)}
                        className="text-xs text-brand hover:text-brand-dark"
                      >
                        URLコピー
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* アカウント一覧 */}
      <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-gray-400">アカウント一覧 ({students.length}件)</h2>
        </div>
        <table className="w-full">
          <thead className="bg-surface-elevated border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">メール</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ロール</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">紐付け顧客</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">作成日</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-sm text-gray-500">
                  アカウントがありません
                </td>
              </tr>
            ) : (
              students.map((s) => (
                <tr key={s.id} className="border-b border-white/[0.08] hover:bg-white/5">
                  <td className="py-3 px-4 text-sm text-white">{s.email}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.role === "admin" ? "bg-red-100 text-red-800" :
                      s.role === "mentor" ? "bg-blue-100 text-blue-800" :
                      "bg-green-100 text-green-800"
                    }`}>
                      {s.role === "admin" ? "管理者" : s.role === "mentor" ? "メンター" : "受講生"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-300">{s.customer_name || "-"}</td>
                  <td className="py-3 px-4 text-sm text-gray-400">{formatDate(s.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
