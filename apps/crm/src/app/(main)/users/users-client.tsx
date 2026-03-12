"use client";

import { useState, useMemo } from "react";
import { formatDate } from "@/lib/utils";

// ================================================================
// 型定義
// ================================================================

interface UserRole {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
  allowed_pages: string[];
  data_months_limit: number | null;
  mask_pii: boolean;
  can_edit_customers: boolean;
  is_active: boolean;
}

interface Invitation {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  allowed_pages: string[];
  data_months_limit: number | null;
  mask_pii: boolean;
  can_edit_customers: boolean;
}

interface UsersClientProps {
  userRoles: UserRole[];
  invitations: Invitation[];
}

// ================================================================
// 定数
// ================================================================

const ALL_PAGES = [
  { key: "/dashboard", label: "ダッシュボード" },
  { key: "/revenue", label: "KPI" },
  { key: "/pipeline", label: "パイプライン" },
  { key: "/analytics", label: "マーケ分析" },
  { key: "/customers", label: "顧客DB" },
  { key: "/form-data", label: "フォームDB" },
  { key: "/orders", label: "注文管理" },
  { key: "/agents", label: "エージェント" },
  { key: "/subsidy", label: "補助金" },
  { key: "/users", label: "ユーザー管理" },
  { key: "/data-sync", label: "データ連携" },
  { key: "/settings", label: "設定" },
];

const DATA_LIMIT_OPTIONS = [
  { value: null, label: "制限なし（全期間）" },
  { value: 1, label: "直近1ヶ月" },
  { value: 3, label: "直近3ヶ月" },
  { value: 6, label: "直近6ヶ月" },
  { value: 12, label: "直近12ヶ月" },
  { value: 24, label: "直近24ヶ月" },
];

// ================================================================
// ヘルパー
// ================================================================

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
    case "member": return "一般";
    case "mentor": return "一般"; // legacy
    case "student": return "受講生";
    default: return role;
  }
}

function roleColor(role: string): string {
  switch (role) {
    case "admin": return "bg-red-500/20 text-red-300";
    case "member": return "bg-blue-500/20 text-blue-300";
    case "mentor": return "bg-blue-500/20 text-blue-300"; // legacy
    case "student": return "bg-green-500/20 text-green-300";
    default: return "bg-gray-500/20 text-gray-400";
  }
}

/** メールアドレスの@前をニックネームとして表示 */
function getNickname(email: string): string {
  return email.split("@")[0] || email;
}

// ================================================================
// 権限編集モーダル
// ================================================================

function PermissionsModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserRole;
  onClose: () => void;
  onSaved: (updated: Partial<UserRole>) => void;
}) {
  const [role, setRole] = useState(user.role === "mentor" ? "member" : user.role);
  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [allowedPages, setAllowedPages] = useState<string[]>(user.allowed_pages);
  const [dataMonthsLimit, setDataMonthsLimit] = useState<number | null>(user.data_months_limit);
  const [maskPii, setMaskPii] = useState(user.mask_pii);
  const [canEditCustomers, setCanEditCustomers] = useState(user.can_edit_customers ?? true);
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);

  const isAdmin = role === "admin";
  const allPagesSelected = allowedPages.length === 0;

  const togglePage = (page: string) => {
    setAllowedPages((prev) => {
      if (prev.includes(page)) {
        return prev.filter((p) => p !== page);
      }
      return [...prev, page];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          display_name: displayName || null,
          allowed_pages: isAdmin ? [] : allowedPages,
          data_months_limit: isAdmin ? null : dataMonthsLimit,
          mask_pii: isAdmin ? false : maskPii,
          can_edit_customers: isAdmin ? true : canEditCustomers,
          is_active: isActive,
        }),
      });
      if (res.ok) {
        onSaved({
          role,
          display_name: displayName || null,
          allowed_pages: isAdmin ? [] : allowedPages,
          data_months_limit: isAdmin ? null : dataMonthsLimit,
          mask_pii: isAdmin ? false : maskPii,
          can_edit_customers: isAdmin ? true : canEditCustomers,
          is_active: isActive,
        });
        onClose();
      } else {
        alert("保存に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-card border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{getNickname(user.email)}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{user.email} / 権限設定</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-2">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* 基本情報 */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">表示名</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={getNickname(user.email)}
                className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">ロール</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value="admin">管理者</option>
                  <option value="member">一般</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">ステータス</label>
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-green-500/20 text-green-300 border border-green-500/30"
                      : "bg-red-500/20 text-red-300 border border-red-500/30"
                  }`}
                >
                  {isActive ? "有効" : "無効"}
                </button>
              </div>
            </div>
          </div>

          {/* admin以外の場合のみ詳細権限を表示 */}
          {!isAdmin && (
            <>
              {/* ページアクセス */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-500 font-medium">アクセス可能ページ</label>
                  <button
                    onClick={() => setAllowedPages(allPagesSelected ? ALL_PAGES.map(p => p.key) : [])}
                    className="text-[10px] text-brand hover:text-brand/80"
                  >
                    {allPagesSelected ? "カスタム" : "全ページ許可"}
                  </button>
                </div>
                {allPagesSelected ? (
                  <p className="text-xs text-gray-400 bg-white/5 rounded-lg px-3 py-2">
                    全ページにアクセス可能（空 = 制限なし）
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_PAGES.map((page) => {
                      const checked = allowedPages.includes(page.key);
                      return (
                        <label
                          key={page.key}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            checked ? "bg-brand/10 border border-brand/30" : "bg-white/[0.03] border border-transparent hover:bg-white/5"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePage(page.key)}
                            className="w-3.5 h-3.5 rounded border-white/20 bg-surface-elevated text-brand focus:ring-brand"
                          />
                          <span className="text-xs text-gray-300">{page.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* データ表示期間 */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">顧客データ表示期間</label>
                <select
                  value={dataMonthsLimit ?? ""}
                  onChange={(e) => setDataMonthsLimit(e.target.value === "" ? null : Number(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {DATA_LIMIT_OPTIONS.map((opt) => (
                    <option key={opt.value ?? "null"} value={opt.value ?? ""}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-600 mt-1">
                  申込日がこの期間外の顧客は顧客DBで非表示になります
                </p>
              </div>

              {/* 顧客データ編集権限 */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">顧客データ編集</label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setCanEditCustomers(!canEditCustomers)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      canEditCustomers ? "bg-brand" : "bg-gray-600"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      canEditCustomers ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                  <div>
                    <span className="text-sm text-gray-300">顧客データの編集を許可</span>
                    <p className="text-[10px] text-gray-600">
                      OFFの場合、閲覧のみ（編集ボタンが非表示になります）
                    </p>
                  </div>
                </label>
              </div>

              {/* 個人情報マスキング */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">個人情報保護</label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setMaskPii(!maskPii)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      maskPii ? "bg-brand" : "bg-gray-600"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      maskPii ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                  <div>
                    <span className="text-sm text-gray-300">顧客名をマスク表示</span>
                    <p className="text-[10px] text-gray-600">
                      メールの@前をID表示し、氏名を隠します
                    </p>
                  </div>
                </label>
              </div>
            </>
          )}

          {isAdmin && (
            <div className="bg-white/5 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400">
                管理者ロールは全ページアクセス可能・データ制限なし・編集可能・個人情報表示の権限を持ちます。
                制限が必要な場合はロールを一般に変更してください。
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 text-sm text-gray-400 hover:text-white">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// 招待作成モーダル（権限設定付き）
// ================================================================

function InviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (inv: Invitation, inviteUrl: string) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("member");
  const [allowedPages, setAllowedPages] = useState<string[]>([]);
  const [dataMonthsLimit, setDataMonthsLimit] = useState<number | null>(null);
  const [maskPii, setMaskPii] = useState(false);
  const [canEditCustomers, setCanEditCustomers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isAdmin = role === "admin";
  const allPagesSelected = allowedPages.length === 0;

  const togglePage = (page: string) => {
    setAllowedPages((prev) =>
      prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          display_name: displayName || null,
          allowed_pages: isAdmin ? [] : allowedPages,
          data_months_limit: isAdmin ? null : dataMonthsLimit,
          mask_pii: isAdmin ? false : maskPii,
          can_edit_customers: isAdmin ? true : canEditCustomers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setGeneratedLink(data.invite_url);
    } catch {
      setError("エラーが発生しました");
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
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface-card border border-white/10 rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">招待リンク作成</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!generatedLink ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">表示名（任意）</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="設定しない場合、メール@前が使われます"
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
                <option value="member">一般</option>
                <option value="admin">管理者</option>
              </select>
            </div>

            {/* 一般ロール時のみ詳細権限を表示 */}
            {!isAdmin && (
              <div className="space-y-4 pt-2 border-t border-white/10">
                <p className="text-xs text-gray-500 font-medium">権限設定</p>

                {/* ページアクセス */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-500">アクセス可能ページ</label>
                    <button type="button"
                      onClick={() => setAllowedPages(allPagesSelected ? ALL_PAGES.map(p => p.key) : [])}
                      className="text-[10px] text-brand hover:text-brand/80"
                    >
                      {allPagesSelected ? "カスタム" : "全ページ許可"}
                    </button>
                  </div>
                  {allPagesSelected ? (
                    <p className="text-xs text-gray-400 bg-white/5 rounded-lg px-3 py-2">全ページにアクセス可能</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {ALL_PAGES.map((page) => {
                        const checked = allowedPages.includes(page.key);
                        return (
                          <label key={page.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            checked ? "bg-brand/10 border border-brand/30" : "bg-white/[0.03] border border-transparent hover:bg-white/5"
                          }`}>
                            <input type="checkbox" checked={checked} onChange={() => togglePage(page.key)}
                              className="w-3.5 h-3.5 rounded border-white/20 bg-surface-elevated text-brand focus:ring-brand" />
                            <span className="text-xs text-gray-300">{page.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* データ表示期間 */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">顧客データ表示期間</label>
                  <select value={dataMonthsLimit ?? ""} onChange={(e) => setDataMonthsLimit(e.target.value === "" ? null : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                    {DATA_LIMIT_OPTIONS.map((opt) => (
                      <option key={opt.value ?? "null"} value={opt.value ?? ""}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* 編集権限 */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <button type="button" onClick={() => setCanEditCustomers(!canEditCustomers)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${canEditCustomers ? "bg-brand" : "bg-gray-600"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${canEditCustomers ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                  <span className="text-sm text-gray-300">顧客データの編集を許可</span>
                </label>

                {/* PII */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <button type="button" onClick={() => setMaskPii(!maskPii)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${maskPii ? "bg-brand" : "bg-gray-600"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${maskPii ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                  <span className="text-sm text-gray-300">顧客名をマスク表示</span>
                </label>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                キャンセル
              </button>
              <button type="submit" disabled={loading}
                className="px-6 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                {loading ? "作成中..." : "招待リンク作成"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
              招待リンクを作成しました。このURLを対象者に共有してください。
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
                <button type="button" onClick={handleCopy}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    copied ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-surface-elevated border border-white/10 text-gray-300 hover:bg-white/5"
                  }`}>
                  {copied ? "コピー済み" : "コピー"}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              有効期限: 7日間 / ロール: {roleLabel(role)} / メールアドレスは受理時に本人が入力します
            </p>
            <div className="flex justify-end pt-2">
              <button type="button" onClick={onClose} className="px-6 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors">
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// メインコンポーネント
// ================================================================

export function UsersClient({ userRoles: initialUsers, invitations: initialInvitations }: UsersClientProps) {
  const [users, setUsers] = useState(initialUsers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRole | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "invitations">("users");
  const [showUsedInvitations, setShowUsedInvitations] = useState(false);

  const handleCopyInviteLink = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {}
  };

  const handleDeleteInvitation = async (invId: string) => {
    if (!confirm("この招待を取り消しますか？")) return;
    const res = await fetch(`/api/users/invitations/${invId}`, { method: "DELETE" });
    if (res.ok) {
      setInvitations((prev) => prev.filter((i) => i.id !== invId));
    }
  };

  const handlePermissionsSaved = (userId: string, updates: Partial<UserRole>) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, ...updates } : u))
    );
  };

  const activeUsers = users.filter((u) => u.role === "admin" || u.role === "member" || u.role === "mentor");

  const filteredInvitations = useMemo(() => {
    if (showUsedInvitations) return invitations;
    return invitations.filter((inv) => !inv.used_at);
  }, [invitations, showUsedInvitations]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ユーザー管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            CRMユーザーのアカウントと権限を管理
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
            activeTab === "users" ? "bg-brand text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          ユーザー ({activeUsers.length})
        </button>
        <button
          onClick={() => setActiveTab("invitations")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "invitations" ? "bg-brand text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          招待 ({filteredInvitations.length})
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-3">
          {activeUsers.length === 0 ? (
            <div className="bg-surface-card border border-white/10 rounded-xl p-12 text-center">
              <p className="text-gray-400">ユーザーがいません</p>
            </div>
          ) : (
            activeUsers.map((u) => (
              <div
                key={u.id}
                className={`bg-surface-card border rounded-xl p-4 ${
                  u.is_active ? "border-white/10" : "border-red-500/20 opacity-60"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    u.role === "admin" ? "bg-red-500/20 text-red-300" : "bg-blue-500/20 text-blue-300"
                  }`}>
                    {getNickname(u.email).charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium truncate">
                        {u.display_name || getNickname(u.email)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${roleColor(u.role)}`}>
                        {roleLabel(u.role)}
                      </span>
                      {!u.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-300">
                          無効
                        </span>
                      )}
                      {u.mask_pii && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/20 text-purple-300">
                          PII制限
                        </span>
                      )}
                      {!u.can_edit_customers && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-300">
                          閲覧専用
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      <span>{u.email}</span>
                      {u.data_months_limit && (
                        <span>データ: 直近{u.data_months_limit}ヶ月</span>
                      )}
                      {u.allowed_pages.length > 0 && (
                        <span>ページ: {u.allowed_pages.length}件許可</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setEditingUser(u)}
                    className="px-3 py-1.5 text-xs text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white transition-colors shrink-0"
                  >
                    権限設定
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Invitations Tab */}
      {activeTab === "invitations" && (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showUsedInvitations}
                onChange={(e) => setShowUsedInvitations(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-white/20 bg-surface-elevated text-brand focus:ring-brand"
              />
              使用済み・期限切れも表示
            </label>
          </div>

          {filteredInvitations.length === 0 ? (
            <div className="bg-surface-card border border-white/10 rounded-xl p-12 text-center">
              <p className="text-gray-400">
                {showUsedInvitations ? "招待がありません" : "有効な招待がありません"}
              </p>
            </div>
          ) : (
            <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-elevated border-b border-white/10">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">表示名</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ロール</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">権限</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">有効期限</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ステータス</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvitations.map((inv) => {
                    const status = getInvitationStatus(inv);
                    const isActive = !inv.used_at && new Date(inv.expires_at) >= new Date();
                    return (
                      <tr key={inv.id} className="border-b border-white/[0.08] hover:bg-white/5">
                        <td className="py-3 px-4 text-sm text-white">{inv.display_name || "（未設定）"}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColor(inv.role)}`}>
                            {roleLabel(inv.role)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {inv.role === "admin" ? (
                              <span className="text-[10px] text-gray-400">全権限</span>
                            ) : (
                              <>
                                {!inv.can_edit_customers && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300">閲覧専用</span>
                                )}
                                {inv.mask_pii && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300">PII制限</span>
                                )}
                                {inv.data_months_limit && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300">{inv.data_months_limit}ヶ月</span>
                                )}
                                {!inv.can_edit_customers && !inv.mask_pii && !inv.data_months_limit && inv.allowed_pages.length === 0 && (
                                  <span className="text-[10px] text-gray-500">制限なし</span>
                                )}
                                {inv.can_edit_customers && !inv.mask_pii && !inv.data_months_limit && inv.allowed_pages.length === 0 && (
                                  <span className="text-[10px] text-gray-500">制限なし</span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-400">{formatDate(inv.expires_at)}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                          {inv.used_at && inv.email && (
                            <span className="ml-2 text-[10px] text-gray-500">{inv.email}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            {isActive && (
                              <button
                                onClick={() => handleCopyInviteLink(inv.token)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                  copiedToken === inv.token
                                    ? "bg-green-500/20 text-green-300"
                                    : "bg-surface-elevated border border-white/10 text-gray-300 hover:bg-white/5"
                                }`}
                              >
                                {copiedToken === inv.token ? "コピー済み" : "リンクコピー"}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteInvitation(inv.id)}
                              className="px-3 py-1 text-xs text-red-400 border border-red-500/20 rounded-md hover:bg-red-500/10 transition-colors"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 招待リンク作成モーダル */}
      {showModal && (
        <InviteModal
          onClose={() => setShowModal(false)}
          onCreated={() => setShowModal(false)}
        />
      )}

      {/* 権限設定モーダル */}
      {editingUser && (
        <PermissionsModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(updates) => handlePermissionsSaved(editingUser.id, updates)}
        />
      )}
    </div>
  );
}
