"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { RichEditor } from "@/components/content/rich-editor";
import {
  ArrowLeft, Plus, Trash2, GripVertical, Video, FileText, Save,
  X, Upload, ChevronDown, ChevronRight, Check, AlertCircle,
} from "lucide-react";
import { cleanNotionMarkdown } from "@/lib/content-utils";

interface LessonData {
  id: string;
  title: string;
  description: string | null;
  lesson_type: string;
  video_url: string | null;
  markdown_content: string | null;
  content_format: string | null;
  duration_minutes: number | null;
  sort_order: number;
  is_active: boolean;
  copy_protected: boolean;
  module_id: string | null;
}

interface ModuleData {
  id: string;
  title: string;
  sort_order: number;
  lessons: LessonData[];
}

import { isYouTubeUrl, getYouTubeEmbedUrl } from "@/lib/content-utils";

// マークダウンを簡易HTML変換（Tiptapへの読み込み用）
function markdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.replace(/```\w*\n?/, "").replace(/\n?```$/, "");
    return `<pre><code>${code}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/^(?!<[hupol]|<li|<pre)(.+)$/gm, "<p>$1</p>");
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  return html;
}

// トースト通知コンポーネント
function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm animate-in slide-in-from-bottom-2 ${
      type === "success" ? "bg-green-900/90 text-green-200" : "bg-red-900/90 text-red-200"
    }`}>
      {type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {message}
    </div>
  );
}

export default function CourseEditPage() {
  const params = useParams();
  const router = useRouter();
  const { role } = useAuth();
  const courseId = params.id as string;
  const isNew = courseId === "new";

  const [form, setForm] = useState({
    title: "", description: "", category: "", level: "beginner",
    duration_weeks: 12, status: "draft",
  });
  const [modules, setModules] = useState<ModuleData[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // レッスン編集パネル
  const [editingLesson, setEditingLesson] = useState<LessonData | null>(null);
  const [lessonForm, setLessonForm] = useState({
    title: "", description: "", lesson_type: "テキスト",
    video_url: "", markdown_content: "", content_format: "html" as string,
    duration_minutes: 0,
  });
  const [lessonSaving, setLessonSaving] = useState(false);
  const [showNotionImport, setShowNotionImport] = useState(false);
  const [notionText, setNotionText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // プラン設定
  const [allPlans, setAllPlans] = useState<{ id: string; name: string; slug: string; target_attribute: string }[]>([]);
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
  const [planSaving, setPlanSaving] = useState(false);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
  };

  const fetchCourse = useCallback(async () => {
    if (isNew) return;
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      if (res.ok) {
        const data = await res.json();
        setForm({
          title: data.title || "",
          description: data.description || "",
          category: data.category || "",
          level: data.level || "beginner",
          duration_weeks: data.duration_weeks || 12,
          status: data.status || "draft",
        });
        setModules(data.modules || []);
        setExpandedModules(new Set((data.modules || []).map((m: ModuleData) => m.id)));
      } else {
        showToast("コース情報の取得に失敗しました", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [courseId, isNew]);

  // プラン一覧を取得
  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/plans");
      if (res.ok) {
        const data = await res.json();
        setAllPlans(data);
      }
    } catch { /* ignore */ }
  }, []);

  // コースのプラン紐付けを取得
  const fetchCoursePlans = useCallback(async () => {
    if (isNew) return;
    try {
      const res = await fetch(`/api/courses/${courseId}/plans`);
      if (res.ok) {
        const planIds: string[] = await res.json();
        setSelectedPlanIds(new Set(planIds));
      }
    } catch { /* ignore */ }
  }, [courseId, isNew]);

  // プラン紐付け保存
  const handleSavePlans = async () => {
    setPlanSaving(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/plans`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_ids: Array.from(selectedPlanIds) }),
      });
      if (res.ok) {
        showToast("プラン設定を保存しました", "success");
      } else {
        showToast("プラン設定の保存に失敗しました", "error");
      }
    } finally {
      setPlanSaving(false);
    }
  };

  const togglePlan = (planId: string) => {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev);
      next.has(planId) ? next.delete(planId) : next.add(planId);
      return next;
    });
  };

  useEffect(() => { fetchCourse(); fetchPlans(); fetchCoursePlans(); }, [fetchCourse, fetchPlans, fetchCoursePlans]);

  if (role !== "admin") {
    return <div className="p-6 bg-surface min-h-screen text-center py-20"><p className="text-gray-400">管理者のみアクセスできます</p></div>;
  }

  // コース保存
  const handleSaveCourse = async () => {
    if (!form.title.trim()) { showToast("コース名を入力してください", "error"); return; }
    setSaving(true);
    try {
      if (isNew) {
        const res = await fetch("/api/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const data = await res.json();
          showToast("コースを作成しました", "success");
          router.push(`/admin/courses/${data.id}`);
        } else {
          const err = await res.json();
          showToast(err.error || "コース作成に失敗しました", "error");
        }
      } else {
        const res = await fetch(`/api/courses/${courseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          showToast("保存しました", "success");
          await fetchCourse();
        } else {
          const err = await res.json();
          showToast(err.error || "保存に失敗しました", "error");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  // ステータス変更（公開/非公開）
  const handleTogglePublish = async () => {
    const newStatus = form.status === "published" ? "draft" : "published";
    const isActive = newStatus === "published";
    const res = await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, is_active: isActive }),
    });
    if (res.ok) {
      setForm((f) => ({ ...f, status: newStatus }));
      showToast(newStatus === "published" ? "コースを公開しました" : "下書きに戻しました", "success");
    } else {
      showToast("ステータス変更に失敗しました", "error");
    }
  };

  // モジュール追加
  const handleAddModule = async () => {
    if (isNew) { showToast("先にコースを保存してください", "error"); return; }
    const title = prompt("モジュール名を入力してください:");
    if (!title?.trim()) return;
    const res = await fetch(`/api/courses/${courseId}/modules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      showToast("モジュールを追加しました", "success");
      await fetchCourse();
    } else {
      showToast("モジュール追加に失敗しました", "error");
    }
  };

  // モジュール名変更
  const handleEditModuleTitle = async (moduleId: string, currentTitle: string) => {
    const title = prompt("モジュール名:", currentTitle);
    if (!title?.trim() || title === currentTitle) return;
    const res = await fetch(`/api/modules/${moduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      showToast("モジュール名を変更しました", "success");
      await fetchCourse();
    } else {
      showToast("モジュール名の変更に失敗しました", "error");
    }
  };

  // モジュール削除
  const handleDeleteModule = async (moduleId: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    const res = await fetch(`/api/modules/${moduleId}`, { method: "DELETE" });
    if (res.ok) {
      showToast("モジュールを削除しました", "success");
      await fetchCourse();
    } else {
      showToast("モジュール削除に失敗しました", "error");
    }
  };

  // レッスン追加
  const handleAddLesson = async (moduleId: string) => {
    const title = prompt("レッスンタイトル:");
    if (!title?.trim()) return;
    const res = await fetch(`/api/modules/${moduleId}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, lesson_type: "テキスト" }),
    });
    if (res.ok) {
      showToast("レッスンを追加しました", "success");
      await fetchCourse();
    } else {
      showToast("レッスン追加に失敗しました", "error");
    }
  };

  // レッスン編集開始
  const handleEditLesson = (lesson: LessonData) => {
    setEditingLesson(lesson);
    // 既存マークダウンコンテンツの場合、HTML変換してエディタに読み込む
    const isMarkdown = !lesson.content_format || lesson.content_format === "markdown";
    const htmlContent = isMarkdown && lesson.markdown_content
      ? markdownToHtml(lesson.markdown_content)
      : (lesson.markdown_content || "");
    setLessonForm({
      title: lesson.title,
      description: lesson.description || "",
      lesson_type: lesson.lesson_type,
      video_url: lesson.video_url || "",
      markdown_content: htmlContent,
      content_format: "html",
      duration_minutes: lesson.duration_minutes || 0,
    });
  };

  // レッスン保存
  const handleSaveLesson = async () => {
    if (!editingLesson) return;
    if (!lessonForm.title.trim()) { showToast("レッスンタイトルを入力してください", "error"); return; }
    setLessonSaving(true);
    try {
      const res = await fetch(`/api/lessons/${editingLesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: lessonForm.title.trim(),
          description: lessonForm.description || null,
          lesson_type: lessonForm.lesson_type,
          video_url: lessonForm.video_url || null,
          markdown_content: lessonForm.markdown_content || null,
          content_format: "html",
          duration_minutes: lessonForm.duration_minutes || null,
        }),
      });
      if (res.ok) {
        showToast("レッスンを保存しました", "success");
        setEditingLesson(null);
        await fetchCourse();
      } else {
        const err = await res.json();
        showToast(err.error || "レッスン保存に失敗しました", "error");
      }
    } finally {
      setLessonSaving(false);
    }
  };

  // レッスン削除
  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm("このレッスンを削除しますか？")) return;
    const res = await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" });
    if (res.ok) {
      showToast("レッスンを削除しました", "success");
      setEditingLesson(null);
      await fetchCourse();
    } else {
      showToast("レッスン削除に失敗しました", "error");
    }
  };

  // Notionインポート（マークダウン→HTML変換してエディタに流し込み）
  const handleNotionImport = () => {
    if (!notionText.trim()) { showToast("マークダウンを入力してください", "error"); return; }
    const cleaned = cleanNotionMarkdown(notionText);
    const html = markdownToHtml(cleaned);
    setLessonForm((f) => ({ ...f, markdown_content: html, content_format: "html" }));
    setShowNotionImport(false);
    setNotionText("");
    showToast("マークダウンをインポートしました", "success");
  };

  // ファイルドロップ
  const handleFileDrop = (e: React.DragEvent | React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const files = "dataTransfer" in e ? e.dataTransfer.files : e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.endsWith(".md")) { showToast(".md ファイルのみ対応しています", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const cleaned = cleanNotionMarkdown(text);
      const html = markdownToHtml(cleaned);
      setLessonForm((f) => ({ ...f, markdown_content: html, content_format: "html" }));
      showToast("ファイルを読み込みました", "success");
    };
    reader.readAsText(file);
  };

  const toggleModule = (id: string) => {
    setExpandedModules((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  if (loading) {
    return <div className="p-6 bg-surface min-h-screen text-center py-20"><p className="text-gray-400">読み込み中...</p></div>;
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* トースト */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* メインエリア */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl">
          <Link href="/admin/courses" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" />コース管理に戻る
          </Link>

          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">
              {isNew ? "新規コース作成" : "コース編集"}
            </h1>
            {!isNew && (
              <button
                onClick={handleTogglePublish}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.status === "published"
                    ? "bg-yellow-900/50 text-yellow-300 hover:bg-yellow-900/70"
                    : "bg-green-900/50 text-green-300 hover:bg-green-900/70"
                }`}
              >
                {form.status === "published" ? "下書きに戻す" : "公開する"}
              </button>
            )}
          </div>

          {/* コース基本情報 */}
          <div className="bg-surface-elevated rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">コース基本情報</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">コース名 <span className="text-red-400">*</span></label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-4 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" placeholder="例: ケース面接基礎講座" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">説明</label>
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-4 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" placeholder="コースの概要..." />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">カテゴリ</label>
                  <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">レベル</label>
                  <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="w-full px-4 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand">
                    <option value="beginner">初級</option>
                    <option value="intermediate">中級</option>
                    <option value="advanced">上級</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">期間(週)</label>
                  <input type="number" min={1} max={52} value={form.duration_weeks} onChange={(e) => setForm({ ...form, duration_weeks: parseInt(e.target.value) || 12 })} className="w-full px-4 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" />
                </div>
              </div>
              <button onClick={handleSaveCourse} disabled={saving} className="bg-brand hover:bg-brand-dark text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
                <Save className="w-4 h-4" />
                {saving ? "保存中..." : isNew ? "コースを作成" : "基本情報を保存"}
              </button>
            </div>
          </div>

          {/* カリキュラム構成 */}
          {!isNew && (
            <div className="bg-surface-elevated rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">カリキュラム構成</h2>
                <button onClick={handleAddModule} className="flex items-center gap-1.5 text-sm bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                  <Plus className="w-4 h-4" />モジュール追加
                </button>
              </div>

              {modules.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-sm mb-3">モジュールを追加してカリキュラムを構成しましょう</p>
                  <button onClick={handleAddModule} className="text-sm text-brand-light hover:text-white transition-colors">
                    <Plus className="w-4 h-4 inline mr-1" />最初のモジュールを追加
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {modules.map((mod) => {
                    const isExpanded = expandedModules.has(mod.id);
                    const sortedLessons = [...mod.lessons].sort((a, b) => a.sort_order - b.sort_order);
                    return (
                      <div key={mod.id} className="border border-white/10 rounded-lg overflow-hidden">
                        {/* モジュールヘッダー */}
                        <div className="flex items-center gap-2 px-4 py-3 bg-surface hover:bg-white/[0.02] transition-colors">
                          <GripVertical className="w-4 h-4 text-gray-600 cursor-grab" />
                          <button onClick={() => toggleModule(mod.id)} className="flex items-center gap-2 flex-1 text-left">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                            <span className="text-white font-medium">{mod.title}</span>
                            <span className="text-xs text-gray-500 ml-2">{mod.lessons.length}レッスン</span>
                          </button>
                          <button onClick={() => handleEditModuleTitle(mod.id, mod.title)} className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors" title="名前変更">
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteModule(mod.id, mod.title)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors" title="削除">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* レッスン一覧 */}
                        {isExpanded && (
                          <div className="border-t border-white/10">
                            {sortedLessons.map((lesson) => (
                              <button
                                key={lesson.id}
                                onClick={() => handleEditLesson(lesson)}
                                className={`w-full flex items-center gap-3 px-6 py-2.5 text-left hover:bg-white/[0.03] transition-colors border-b border-white/[0.06] last:border-0 ${
                                  editingLesson?.id === lesson.id ? "bg-brand-muted" : ""
                                }`}
                              >
                                {lesson.lesson_type === "動画" ? (
                                  <Video className="w-4 h-4 text-blue-400 shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-green-400 shrink-0" />
                                )}
                                <span className="text-sm text-gray-300 flex-1 truncate">{lesson.title}</span>
                                {lesson.duration_minutes ? (
                                  <span className="text-xs text-gray-500">{lesson.duration_minutes}分</span>
                                ) : (
                                  <span className="text-xs text-gray-600">未設定</span>
                                )}
                              </button>
                            ))}
                            <button
                              onClick={() => handleAddLesson(mod.id)}
                              className="w-full flex items-center gap-2 px-6 py-2.5 text-sm text-gray-500 hover:text-brand-light hover:bg-white/[0.02] transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />レッスン追加
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* プラン別アクセス設定 */}
          {!isNew && allPlans.length > 0 && (
            <div className="bg-surface-elevated rounded-xl p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">プラン別アクセス設定</h2>
                  <p className="text-xs text-gray-500 mt-1">チェックなし = 全プランに公開</p>
                </div>
                <button
                  onClick={handleSavePlans}
                  disabled={planSaving}
                  className="bg-brand hover:bg-brand-dark text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {planSaving ? "保存中..." : "プラン設定を保存"}
                </button>
              </div>

              {/* 既卒プラン */}
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-400 mb-2">既卒プラン</h3>
                <div className="grid grid-cols-2 gap-2">
                  {allPlans.filter((p) => p.target_attribute === "既卒").map((plan) => (
                    <label
                      key={plan.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlanIds.has(plan.id)}
                        onChange={() => togglePlan(plan.id)}
                        className="rounded border-gray-600 bg-surface text-brand focus:ring-brand/50"
                      />
                      <span className="text-sm text-gray-300">{plan.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 新卒プラン */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2">新卒プラン</h3>
                <div className="grid grid-cols-2 gap-2">
                  {allPlans.filter((p) => p.target_attribute === "新卒").map((plan) => (
                    <label
                      key={plan.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlanIds.has(plan.id)}
                        onChange={() => togglePlan(plan.id)}
                        className="rounded border-gray-600 bg-surface text-brand focus:ring-brand/50"
                      />
                      <span className="text-sm text-gray-300">{plan.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* レッスン編集パネル（右サイド） */}
      {editingLesson && (
        <div className="w-[520px] bg-surface-card border-l border-white/10 overflow-y-auto shrink-0">
          <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-surface-card z-10">
            <h3 className="text-white font-medium">レッスン編集</h3>
            <div className="flex items-center gap-2">
              <button onClick={handleSaveLesson} disabled={lessonSaving} className="bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded text-sm transition-colors disabled:opacity-50 flex items-center gap-1">
                <Save className="w-3.5 h-3.5" />{lessonSaving ? "保存中..." : "保存"}
              </button>
              <button onClick={() => setEditingLesson(null)} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">タイトル <span className="text-red-400">*</span></label>
              <input type="text" value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} className="w-full px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">レッスンタイプ</label>
              <select value={lessonForm.lesson_type} onChange={(e) => setLessonForm({ ...lessonForm, lesson_type: e.target.value })} className="w-full px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand">
                <option value="動画">動画</option>
                <option value="テキスト">テキスト</option>
                <option value="ケース演習">ケース演習</option>
                <option value="模擬面接">模擬面接</option>
                <option value="課題">課題</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">説明</label>
              <textarea rows={2} value={lessonForm.description} onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })} className="w-full px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" placeholder="レッスンの概要..." />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">所要時間 (分)</label>
              <input type="number" min={0} value={lessonForm.duration_minutes} onChange={(e) => setLessonForm({ ...lessonForm, duration_minutes: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" />
            </div>

            {/* 動画レッスン: YouTube URL */}
            {lessonForm.lesson_type === "動画" && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">動画URL（YouTube / Google Drive）</label>
                <input type="url" value={lessonForm.video_url} onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })} className="w-full px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" placeholder="https://www.youtube.com/watch?v=... or https://drive.google.com/file/d/..." />
                {lessonForm.video_url && isYouTubeUrl(lessonForm.video_url) && (
                  <div className="mt-3 rounded-lg overflow-hidden aspect-video max-w-sm">
                    <iframe
                      src={getYouTubeEmbedUrl(lessonForm.video_url)}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
                {lessonForm.video_url && !isYouTubeUrl(lessonForm.video_url) && (
                  <p className="mt-1 text-xs text-yellow-400">YouTube URLの形式で入力してください</p>
                )}
              </div>
            )}

            {/* リッチテキストエディタ（全レッスンタイプ対応） */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-300">コンテンツ</label>
                <button
                  onClick={() => setShowNotionImport(true)}
                  className="flex items-center gap-1 text-xs text-brand-light hover:text-white transition-colors"
                >
                  <Upload className="w-3 h-3" />Notionからインポート
                </button>
              </div>
              <RichEditor
                content={lessonForm.markdown_content}
                onChange={(html) => setLessonForm((f) => ({ ...f, markdown_content: html }))}
                placeholder="コンテンツを入力..."
              />
            </div>

            {/* ファイルドロップ */}
            <div
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-brand/50", "bg-brand/5"); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove("border-brand/50", "bg-brand/5"); }}
              onDrop={(e) => { e.currentTarget.classList.remove("border-brand/50", "bg-brand/5"); handleFileDrop(e); }}
              className="border-2 border-dashed border-white/10 rounded-lg p-4 text-center cursor-pointer hover:border-white/20 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".md" onChange={handleFileDrop} className="hidden" />
              <Upload className="w-5 h-5 text-gray-500 mx-auto mb-1" />
              <p className="text-sm text-gray-500">.md ファイルをドラッグ&ドロップ、またはクリック</p>
            </div>

            {/* 削除ボタン */}
            <button
              onClick={() => handleDeleteLesson(editingLesson.id)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-red-900/30 text-red-300 hover:bg-red-900/50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />このレッスンを削除
            </button>
          </div>

          {/* Notionインポートモーダル */}
          {showNotionImport && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowNotionImport(false); setNotionText(""); } }}>
              <div className="bg-surface-elevated rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-4">Notionからインポート</h3>
                <ol className="text-sm text-gray-400 space-y-1 mb-4 list-decimal list-inside">
                  <li>Notionでページを開く</li>
                  <li>右上「...」→「エクスポート」</li>
                  <li>形式: Markdown & CSV を選択</li>
                  <li>ダウンロードした .md の中身を貼り付け</li>
                </ol>
                <textarea
                  rows={10}
                  value={notionText}
                  onChange={(e) => setNotionText(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-brand mb-4"
                  placeholder="マークダウンを貼り付け..."
                  autoFocus
                />
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setShowNotionImport(false); setNotionText(""); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">キャンセル</button>
                  <button onClick={handleNotionImport} disabled={!notionText.trim()} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">インポート</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
