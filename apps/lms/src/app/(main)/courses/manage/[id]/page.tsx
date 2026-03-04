"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { MarkdownViewer } from "@/components/content/markdown-viewer";
import {
  ArrowLeft, Plus, Trash2, GripVertical, Video, FileText, Save,
  X, Upload, ChevronDown, ChevronRight,
} from "lucide-react";

interface LessonData {
  id: string;
  title: string;
  description: string | null;
  lesson_type: string;
  video_url: string | null;
  markdown_content: string | null;
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

interface CourseData {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  level: string;
  duration_weeks: number;
  status: string;
  is_active: boolean;
  slug: string;
  modules: ModuleData[];
}

// YouTube URL関連
function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}

function getYouTubeEmbedUrl(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?#]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

// Notionマークダウンクリーンアップ
function cleanNotionMarkdown(md: string): string {
  let cleaned = md;
  // Notionの空リンク除去: [text]() → text
  cleaned = cleaned.replace(/\[([^\]]+)\]\(\)/g, "$1");
  // 連続する空行を1つに正規化
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  // 先頭のプロパティ表記除去 (Notionエクスポートの先頭メタデータ)
  cleaned = cleaned.replace(/^(.*\n)+?(?=# )/m, "");
  // Notionのコールアウト変換
  cleaned = cleaned.replace(/> [💡🔥⚠️📌❗]\s*/g, "> ");
  return cleaned.trim();
}

// マークダウンを簡易HTML変換
function markdownToHtml(md: string): string {
  let html = md;
  // ヘッダー
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Bold/Italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // コードブロック
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.replace(/```\w*\n?/, "").replace(/\n?```$/, "");
    return `<pre><code>${code}</code></pre>`;
  });
  // インラインコード
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // リスト
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
  // リンク
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // 段落
  html = html.replace(/^(?!<[hupol]|<li|<pre)(.+)$/gm, "<p>$1</p>");
  // 引用
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  return html;
}

export default function CourseEditPage() {
  const params = useParams();
  const router = useRouter();
  const { role } = useAuth();
  const courseId = params.id as string;
  const isNew = courseId === "new";

  const [course, setCourse] = useState<CourseData | null>(null);
  const [form, setForm] = useState({
    title: "", description: "", category: "", level: "beginner",
    duration_weeks: 12, status: "draft",
  });
  const [modules, setModules] = useState<ModuleData[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // レッスン編集パネル
  const [editingLesson, setEditingLesson] = useState<LessonData | null>(null);
  const [lessonForm, setLessonForm] = useState({
    title: "", description: "", lesson_type: "テキスト",
    video_url: "", markdown_content: "", duration_minutes: 0,
  });
  const [showNotionImport, setShowNotionImport] = useState(false);
  const [notionText, setNotionText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCourse = useCallback(async () => {
    if (isNew) return;
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      if (res.ok) {
        const data = await res.json();
        setCourse(data);
        setForm({
          title: data.title || "",
          description: data.description || "",
          category: data.category || "",
          level: data.level || "beginner",
          duration_weeks: data.duration_weeks || 12,
          status: data.status || "draft",
        });
        setModules(data.modules || []);
        // 全モジュール展開
        setExpandedModules(new Set((data.modules || []).map((m: ModuleData) => m.id)));
      }
    } finally {
      setLoading(false);
    }
  }, [courseId, isNew]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  if (role !== "admin") {
    return <div className="p-6 bg-surface min-h-screen text-center py-20"><p className="text-gray-400">管理者のみアクセスできます</p></div>;
  }

  // コース保存
  const handleSaveCourse = async () => {
    if (!form.title.trim()) return alert("コース名を入力してください");
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
          router.push(`/courses/manage/${data.id}`);
        }
      } else {
        await fetch(`/api/courses/${courseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        await fetchCourse();
      }
    } finally {
      setSaving(false);
    }
  };

  // ステータス変更（公開/非公開）
  const handleTogglePublish = async () => {
    const newStatus = form.status === "published" ? "draft" : "published";
    const isActive = newStatus === "published";
    await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, is_active: isActive }),
    });
    setForm((f) => ({ ...f, status: newStatus }));
  };

  // モジュール追加
  const handleAddModule = async () => {
    if (isNew) return;
    const title = prompt("モジュール名を入力してください:");
    if (!title) return;
    const res = await fetch(`/api/courses/${courseId}/modules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) await fetchCourse();
  };

  // モジュール名変更
  const handleEditModuleTitle = async (moduleId: string, currentTitle: string) => {
    const title = prompt("モジュール名:", currentTitle);
    if (!title || title === currentTitle) return;
    await fetch(`/api/modules/${moduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await fetchCourse();
  };

  // モジュール削除
  const handleDeleteModule = async (moduleId: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？配下のレッスンは未分類になります。`)) return;
    await fetch(`/api/modules/${moduleId}`, { method: "DELETE" });
    await fetchCourse();
  };

  // レッスン追加
  const handleAddLesson = async (moduleId: string) => {
    const title = prompt("レッスンタイトル:");
    if (!title) return;
    const res = await fetch(`/api/modules/${moduleId}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, lesson_type: "テキスト" }),
    });
    if (res.ok) await fetchCourse();
  };

  // レッスン編集開始
  const handleEditLesson = (lesson: LessonData) => {
    setEditingLesson(lesson);
    setLessonForm({
      title: lesson.title,
      description: lesson.description || "",
      lesson_type: lesson.lesson_type,
      video_url: lesson.video_url || "",
      markdown_content: lesson.markdown_content || "",
      duration_minutes: lesson.duration_minutes || 0,
    });
  };

  // レッスン保存
  const handleSaveLesson = async () => {
    if (!editingLesson) return;
    await fetch(`/api/lessons/${editingLesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: lessonForm.title,
        description: lessonForm.description || null,
        lesson_type: lessonForm.lesson_type,
        video_url: lessonForm.video_url || null,
        markdown_content: lessonForm.markdown_content || null,
        duration_minutes: lessonForm.duration_minutes || null,
      }),
    });
    setEditingLesson(null);
    await fetchCourse();
  };

  // レッスン削除
  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm("このレッスンを削除しますか？")) return;
    await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" });
    setEditingLesson(null);
    await fetchCourse();
  };

  // Notionインポート
  const handleNotionImport = () => {
    if (!notionText.trim()) return;
    const cleaned = cleanNotionMarkdown(notionText);
    setLessonForm((f) => ({ ...f, markdown_content: cleaned }));
    setShowNotionImport(false);
    setNotionText("");
  };

  // ファイルドロップ
  const handleFileDrop = (e: React.DragEvent | React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const files = "dataTransfer" in e ? e.dataTransfer.files : e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.endsWith(".md")) return alert(".md ファイルのみ対応しています");
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const cleaned = cleanNotionMarkdown(text);
      setLessonForm((f) => ({ ...f, markdown_content: cleaned }));
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
      {/* メインエリア */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl">
          <Link href="/courses/manage" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
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
                  <input type="number" value={form.duration_weeks} onChange={(e) => setForm({ ...form, duration_weeks: parseInt(e.target.value) || 12 })} className="w-full px-4 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" />
                </div>
              </div>
              <button onClick={handleSaveCourse} disabled={saving} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
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
                <button onClick={handleAddModule} className="flex items-center gap-1 text-sm text-brand-light hover:text-white transition-colors">
                  <Plus className="w-4 h-4" />モジュール追加
                </button>
              </div>

              {modules.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">モジュールを追加してカリキュラムを構成しましょう</p>
              ) : (
                <div className="space-y-3">
                  {modules.map((mod) => {
                    const isExpanded = expandedModules.has(mod.id);
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
                          <button onClick={() => handleEditModuleTitle(mod.id, mod.title)} className="p-1 text-gray-500 hover:text-white transition-colors" title="名前変更">
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteModule(mod.id, mod.title)} className="p-1 text-gray-500 hover:text-red-400 transition-colors" title="削除">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* レッスン一覧 */}
                        {isExpanded && (
                          <div className="border-t border-white/10">
                            {mod.lessons.map((lesson) => (
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
                                {lesson.duration_minutes && (
                                  <span className="text-xs text-gray-500">{lesson.duration_minutes}分</span>
                                )}
                              </button>
                            ))}
                            <button
                              onClick={() => handleAddLesson(mod.id)}
                              className="w-full flex items-center gap-2 px-6 py-2.5 text-sm text-gray-500 hover:text-brand-light transition-colors"
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
        </div>
      </div>

      {/* レッスン編集パネル（右サイド） */}
      {editingLesson && (
        <div className="w-[520px] bg-surface-card border-l border-white/10 overflow-y-auto shrink-0">
          <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-surface-card z-10">
            <h3 className="text-white font-medium">レッスン編集</h3>
            <div className="flex items-center gap-2">
              <button onClick={handleSaveLesson} className="bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1">
                <Save className="w-3.5 h-3.5" />保存
              </button>
              <button onClick={() => setEditingLesson(null)} className="p-1.5 text-gray-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">タイトル</label>
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
              <input type="number" value={lessonForm.duration_minutes} onChange={(e) => setLessonForm({ ...lessonForm, duration_minutes: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" />
            </div>

            {/* 動画レッスン: YouTube URL */}
            {lessonForm.lesson_type === "動画" && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">YouTube限定公開URL</label>
                <input type="url" value={lessonForm.video_url} onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })} className="w-full px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" placeholder="https://www.youtube.com/watch?v=..." />
                {lessonForm.video_url && isYouTubeUrl(lessonForm.video_url) && (
                  <div className="mt-3 rounded-lg overflow-hidden aspect-video">
                    <iframe
                      src={getYouTubeEmbedUrl(lessonForm.video_url)}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
              </div>
            )}

            {/* テキストレッスン: マークダウンエディタ */}
            {(lessonForm.lesson_type === "テキスト" || lessonForm.lesson_type === "ケース演習") && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-300">マークダウン教材</label>
                  <button
                    onClick={() => setShowNotionImport(true)}
                    className="flex items-center gap-1 text-xs text-brand-light hover:text-white transition-colors"
                  >
                    <Upload className="w-3 h-3" />Notionからインポート
                  </button>
                </div>
                <textarea
                  rows={12}
                  value={lessonForm.markdown_content}
                  onChange={(e) => setLessonForm({ ...lessonForm, markdown_content: e.target.value })}
                  className="w-full px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-brand"
                  placeholder="# タイトル\n\nマークダウンで教材を書く..."
                />
                {lessonForm.markdown_content && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-2">プレビュー:</p>
                    <div className="bg-surface rounded-lg p-4 border border-white/10 max-h-64 overflow-y-auto">
                      <MarkdownViewer
                        content={markdownToHtml(lessonForm.markdown_content)}
                        protected={false}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ファイルドロップ */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className="border-2 border-dashed border-white/10 rounded-lg p-4 text-center cursor-pointer hover:border-brand/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".md" onChange={handleFileDrop} className="hidden" />
              <p className="text-sm text-gray-500">.md ファイルをドラッグ&ドロップ</p>
            </div>

            {/* 削除ボタン */}
            <button
              onClick={() => handleDeleteLesson(editingLesson.id)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />このレッスンを削除
            </button>
          </div>

          {/* Notionインポートモーダル */}
          {showNotionImport && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
              <div className="bg-surface-elevated rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-4">Notionからインポート</h3>
                <ol className="text-sm text-gray-400 space-y-1 mb-4">
                  <li>1. Notionでページを開く</li>
                  <li>2. 右上「...」→「エクスポート」</li>
                  <li>3. 形式: Markdown & CSV を選択</li>
                  <li>4. ダウンロードした .md の中身を貼り付け</li>
                </ol>
                <textarea
                  rows={10}
                  value={notionText}
                  onChange={(e) => setNotionText(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-white/10 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-brand mb-4"
                  placeholder="マークダウンを貼り付け..."
                />
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setShowNotionImport(false); setNotionText(""); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">キャンセル</button>
                  <button onClick={handleNotionImport} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm transition-colors">インポート</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
