"use client";

import { useState, useEffect, useCallback } from "react";

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
  role: string;
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

interface Course {
  id: string;
  title: string;
}

interface Mentor {
  id: string;
  name: string;
  booking_url: string | null;
  line_url: string | null;
  is_active: boolean;
}

interface StudentMentor {
  id: string;
  mentor_id: string;
  role: "primary" | "sub";
  assigned_at: string;
  is_active: boolean;
  mentors: {
    id: string;
    name: string;
    booking_url: string | null;
    line_url: string | null;
  };
}

// --- メンターアサイン管理パネル ---
function MentorAssignmentPanel({ student, allMentors }: { student: Student; allMentors: Mentor[] }) {
  const [assignments, setAssignments] = useState<StudentMentor[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [addMentorId, setAddMentorId] = useState("");
  const [addRole, setAddRole] = useState<"primary" | "sub">("sub");
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    setLoadingAssignments(true);
    try {
      const res = await fetch(`/api/admin/student-mentors?user_id=${student.user_id}`);
      if (res.ok) {
        const data = await res.json();
        setAssignments(data);
      }
    } catch {
      setError("メンター情報の取得に失敗しました");
    } finally {
      setLoadingAssignments(false);
    }
  }, [student.user_id]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const handleAdd = async () => {
    if (!addMentorId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/student-mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: student.user_id, mentor_id: addMentorId, role: addRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "追加に失敗しました");
        return;
      }
      setAddMentorId("");
      setAddRole("sub");
      await fetchAssignments();
    } catch {
      setError("追加に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeRole = async (assignment: StudentMentor, newRole: "primary" | "sub") => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/student-mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: student.user_id, mentor_id: assignment.mentor_id, role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "変更に失敗しました");
        return;
      }
      await fetchAssignments();
    } catch {
      setError("変更に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/student-mentors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: assignmentId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "解除に失敗しました");
        return;
      }
      setConfirmDeleteId(null);
      await fetchAssignments();
    } catch {
      setError("解除に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  // 既にアサイン済みのメンターIDを除外
  const assignedMentorIds = assignments.map((a) => a.mentor_id);
  const availableMentors = allMentors.filter((m) => m.is_active && !assignedMentorIds.includes(m.id));

  if (loadingAssignments) {
    return (
      <div className="px-4 py-3 text-xs text-gray-500">読み込み中...</div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="text-xs font-semibold text-gray-400 mb-1">担当メンター</div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
          {error}
        </div>
      )}

      {/* 現在のアサイン */}
      {assignments.length === 0 ? (
        <div className="text-xs text-gray-500">メンター未割当</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 bg-surface-elevated border border-white/10 rounded-lg px-2.5 py-1.5"
            >
              <span className="text-sm text-white">{a.mentors.name}</span>
              <button
                onClick={() => handleChangeRole(a, a.role === "primary" ? "sub" : "primary")}
                disabled={saving}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                  a.role === "primary"
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : "bg-gray-500/20 text-gray-400 hover:bg-gray-500/30"
                }`}
                title={`クリックで${a.role === "primary" ? "副担当" : "主担当"}に変更`}
              >
                {a.role === "primary" ? "主担当" : "副担当"}
              </button>
              {confirmDeleteId === a.id ? (
                <span className="flex items-center gap-1 ml-1">
                  <button
                    onClick={() => handleRemove(a.id)}
                    disabled={saving}
                    className="text-[10px] text-red-400 hover:text-red-300 font-medium"
                  >
                    解除する
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-[10px] text-gray-500 hover:text-gray-400"
                  >
                    取消
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(a.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors ml-0.5"
                  title="解除"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* メンター追加 */}
      <div className="flex items-center gap-2">
        <select
          value={addMentorId}
          onChange={(e) => setAddMentorId(e.target.value)}
          className="flex-1 max-w-[200px] px-2 py-1.5 bg-surface-elevated border border-white/10 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">メンターを選択...</option>
          {availableMentors.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select
          value={addRole}
          onChange={(e) => setAddRole(e.target.value as "primary" | "sub")}
          className="px-2 py-1.5 bg-surface-elevated border border-white/10 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="sub">副担当</option>
          <option value="primary">主担当</option>
        </select>
        <button
          onClick={handleAdd}
          disabled={!addMentorId || saving}
          className="px-3 py-1.5 bg-brand/20 text-brand rounded text-xs font-medium hover:bg-brand/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "..." : "追加"}
        </button>
      </div>
    </div>
  );
}

export function StudentsAdminClient({ students, invitations }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteRole, setInviteRole] = useState("student");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [allMentors, setAllMentors] = useState<Mentor[]>([]);

  useEffect(() => {
    fetch("/api/admin/courses/list")
      .then((res) => res.json())
      .then((data) => setCourses(data.courses || []))
      .catch(() => {});
    // メンター一覧を取得
    fetch("/api/admin/mentors")
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setAllMentors(data); })
      .catch(() => {});
  }, []);

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]
    );
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setInviteUrl(null);

    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName: displayName || undefined, role: inviteRole, sendEmail, courseIds: selectedCourseIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error });
        return;
      }
      let msg = "招待URLを生成しました";
      if (data.email_sent) msg += "（メールも送信済み）";
      if (data.email_error) msg += `（メール送信失敗: ${data.email_error}）`;
      setMessage({ type: "success", text: msg });
      setInviteUrl(data.invite_url);
      setEmail("");
      setDisplayName("");
      setSelectedCourseIds([]);
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
          <h1 className="text-2xl font-bold text-white">ユーザー管理</h1>
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
          <h2 className="text-lg font-semibold text-white mb-1">ユーザーを招待</h2>
          <p className="text-xs text-gray-500 mb-4">メールアドレスを入力すると顧客DBから自動で紐づけます</p>
          <form onSubmit={handleInvite} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">ロール *</label>
              <div className="flex gap-2">
                {[
                  { value: "student", label: "受講生", color: "bg-green-600" },
                  { value: "mentor", label: "メンター", color: "bg-blue-600" },
                  { value: "admin", label: "管理者", color: "bg-red-600" },
                ].map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setInviteRole(r.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      inviteRole === r.value
                        ? `${r.color} text-white`
                        : "bg-surface-elevated text-gray-400 hover:text-white border border-white/10"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">メールアドレス *</label>
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
              <label className="block text-sm font-medium text-gray-300 mb-1">表示名（任意）</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="顧客DBに登録があれば自動取得されます"
                className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            {/* コース選択 */}
            {courses.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">アクセス可能コース</label>
                <p className="text-xs text-gray-500 mb-2">選択しないとコースが表示されません</p>
                <div className="space-y-2">
                  {courses.map((course) => (
                    <label key={course.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCourseIds.includes(course.id)}
                        onChange={() => toggleCourse(course.id)}
                        className="w-4 h-4 rounded border-white/20 bg-surface-elevated text-brand focus:ring-brand"
                      />
                      <span className="text-sm text-gray-300">{course.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-surface-elevated text-brand focus:ring-brand"
              />
              <span className="text-sm text-gray-300">招待メールも同時に送信する</span>
            </label>

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
              {loading ? "生成中..." : sendEmail ? "招待URL生成 & メール送信" : "招待URLを生成"}
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
                <th className="text-left py-2 px-4 text-xs font-semibold text-gray-500">ロール</th>
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
                    <td className="py-2 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        inv.role === "admin" ? "bg-red-100 text-red-800" :
                        inv.role === "mentor" ? "bg-blue-100 text-blue-800" :
                        "bg-green-100 text-green-800"
                      }`}>
                        {inv.role === "admin" ? "管理者" : inv.role === "mentor" ? "メンター" : "受講生"}
                      </span>
                    </td>
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
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 w-6"></th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">メール</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ロール</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">紐付け顧客</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">作成日</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-gray-500">
                  アカウントがありません
                </td>
              </tr>
            ) : (
              students.map((s) => {
                const isExpanded = expandedUserId === s.user_id;
                return (
                  <tr key={s.id} className="border-b border-white/[0.08]">
                    <td colSpan={5} className="p-0">
                      <div
                        className="flex items-center cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => setExpandedUserId(isExpanded ? null : s.user_id)}
                      >
                        <div className="py-3 px-4 w-6 text-gray-500">
                          <svg
                            className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <div className="py-3 px-4 text-sm text-white flex-1">{s.email}</div>
                        <div className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.role === "admin" ? "bg-red-100 text-red-800" :
                            s.role === "mentor" ? "bg-blue-100 text-blue-800" :
                            "bg-green-100 text-green-800"
                          }`}>
                            {s.role === "admin" ? "管理者" : s.role === "mentor" ? "メンター" : "受講生"}
                          </span>
                        </div>
                        <div className="py-3 px-4 text-sm text-gray-300">{s.customer_name || "-"}</div>
                        <div className="py-3 px-4 text-sm text-gray-400">{formatDate(s.created_at)}</div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-white/[0.05] bg-surface-elevated/50">
                          <MentorAssignmentPanel student={s} allMentors={allMentors} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
