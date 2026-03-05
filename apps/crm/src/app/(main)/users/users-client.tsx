"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";

interface UserRole {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

interface UsersClientProps {
  userRoles: UserRole[];
  invitations: Invitation[];
}

function getInvitationStatus(inv: Invitation): { label: string; color: string } {
  if (inv.used_at) {
    return { label: "使用済み", color: "bg-green-500/20 text-green-300" };
  }
  if (new Date(inv.expires_at) < new Date()) {
    return { label: "期限切れ", color: "bg-red-500/20 text-red-300" };
  }
  return { label: "未使用", color: "bg-blue-500/20 text-blue-300" };
}

function roleLabel(role: string): string {
  switch (role) {
    case "admin": return "管理者";
    case "mentor": return "メンター";
    case "student": return "受講生";
    default: return role;
  }
}

function roleColor(role: string): string {
  switch (role) {
    case "admin": return "bg-red-500/20 text-red-300";
    case "mentor": return "bg-blue-500/20 text-blue-300";
    case "student": return "bg-green-500/20 text-green-300";
    default: return "bg-gray-500/20 text-gray-400";
  }
}

export function UsersClient({ userRoles, invitations }: UsersClientProps) {
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("mentor");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "invitations">("users");

  const handleCopyInviteLink = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // フォールバック
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setGeneratedLink(null);

    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          display_name: displayName || null,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }
      setMessage({ type: "success", text: data.message });
      setGeneratedLink(data.invite_url);
    } catch {
      setMessage({ type: "error", text: "エラーが発生しました" });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // フォールバック: 選択してコピーを促す
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEmail("");
    setDisplayName("");
    setRole("mentor");
    setMessage(null);
    setGeneratedLink(null);
    setCopied(false);
  };

  const adminMentorUsers = userRoles.filter((u) => u.role === "admin" || u.role === "mentor");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ユーザー管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            CRM管理者・メンターのアカウントと招待を管理
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
        >
          招待リンク作成
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-elevated rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "users"
              ? "bg-brand text-white"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          ユーザー ({adminMentorUsers.length})
        </button>
        <button
          onClick={() => setActiveTab("invitations")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "invitations"
              ? "bg-brand text-white"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          招待 ({invitations.length})
        </button>
      </div>

      {/* Users Table */}
      {activeTab === "users" && (
        <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-elevated border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">メールアドレス</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">表示名</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ロール</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">作成日</th>
              </tr>
            </thead>
            <tbody>
              {adminMentorUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-gray-500">
                    管理者・メンターのユーザーがいません
                  </td>
                </tr>
              )}
              {adminMentorUsers.map((u) => (
                <tr key={u.id} className="border-b border-white/[0.08] hover:bg-white/5">
                  <td className="py-3 px-4 text-sm text-white">{u.email}</td>
                  <td className="py-3 px-4 text-sm text-gray-300">{u.display_name || "-"}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColor(u.role)}`}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-400">{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invitations Table */}
      {activeTab === "invitations" && (
        <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-elevated border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">メールアドレス</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">表示名</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ロール</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">有効期限</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ステータス</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {invitations.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-gray-500">
                    招待がありません
                  </td>
                </tr>
              )}
              {invitations.map((inv) => {
                const status = getInvitationStatus(inv);
                const isActive = !inv.used_at && new Date(inv.expires_at) >= new Date();
                return (
                  <tr key={inv.id} className="border-b border-white/[0.08] hover:bg-white/5">
                    <td className="py-3 px-4 text-sm text-white">{inv.email}</td>
                    <td className="py-3 px-4 text-sm text-gray-300">{inv.display_name || "-"}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColor(inv.role)}`}>
                        {roleLabel(inv.role)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400">{formatDate(inv.expires_at)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {isActive && (
                        <button
                          onClick={() => handleCopyInviteLink(inv.token)}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                            copiedToken === inv.token
                              ? "bg-green-500/20 text-green-300"
                              : "bg-surface-elevated border border-white/10 text-gray-300 hover:bg-white/5"
                          }`}
                        >
                          {copiedToken === inv.token ? "コピー済み" : "リンクをコピー"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={handleCloseModal} />
          <div className="relative bg-surface-card border border-white/10 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">招待リンク作成</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {!generatedLink ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    メールアドレス <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    表示名
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="山田 太郎"
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    ロール <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="mentor">メンター</option>
                    <option value="admin">管理者</option>
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

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading ? "作成中..." : "招待リンク作成"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
                  招待リンクを作成しました。以下のリンクを対象者に共有してください。
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">招待リンク</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={generatedLink}
                      readOnly
                      className="flex-1 px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm font-mono focus:outline-none select-all"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                        copied
                          ? "bg-green-500/20 text-green-300 border border-green-500/30"
                          : "bg-surface-elevated border border-white/10 text-gray-300 hover:bg-white/5"
                      }`}
                    >
                      {copied ? "コピー済み" : "コピー"}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  有効期限: 7日間 / 対象: {email} / ロール: {roleLabel(role)}
                </p>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-6 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
