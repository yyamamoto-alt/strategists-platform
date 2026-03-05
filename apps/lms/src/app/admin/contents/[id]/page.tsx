"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft, GripVertical } from "lucide-react";

interface Lesson {
  id: string;
  title: string;
  lesson_type: string;
  content_format: string | null;
  markdown_content: string | null;
  video_url: string | null;
  content_url: string | null;
  sort_order: number;
  duration_minutes: number | null;
  module_id: string | null;
}

interface ContentDetail {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
}

const LESSON_TYPES = [
  { value: "テキスト", label: "テキスト（マークダウン/HTML）" },
  { value: "動画", label: "動画" },
  { value: "リンク", label: "外部リンク" },
];

export default function ContentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contentId = params.id as string;

  const [content, setContent] = useState<ContentDetail | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLesson, setEditingLesson] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Lesson>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newLesson, setNewLesson] = useState({ title: "", lesson_type: "テキスト" });

  const fetchData = useCallback(async () => {
    const [contentRes, lessonsRes] = await Promise.all([
      fetch(`/api/admin/contents/${contentId}`),
      fetch(`/api/admin/contents/${contentId}/lessons`),
    ]);
    if (contentRes.ok) setContent(await contentRes.json());
    if (lessonsRes.ok) setLessons(await lessonsRes.json());
    setLoading(false);
  }, [contentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateLesson = async () => {
    if (!newLesson.title.trim()) return;
    const res = await fetch(`/api/admin/contents/${contentId}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLesson),
    });
    if (res.ok) {
      const created = await res.json();
      setLessons((prev) => [...prev, created]);
      setNewLesson({ title: "", lesson_type: "テキスト" });
      setShowCreate(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    const res = await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" });
    if (res.ok) setLessons((prev) => prev.filter((l) => l.id !== lessonId));
  };

  const startEdit = (lesson: Lesson) => {
    setEditingLesson(lesson.id);
    setEditForm({
      title: lesson.title,
      lesson_type: lesson.lesson_type,
      markdown_content: lesson.markdown_content || "",
      video_url: lesson.video_url || "",
      content_url: lesson.content_url || "",
      duration_minutes: lesson.duration_minutes,
    });
  };

  const saveEdit = async () => {
    if (!editingLesson) return;
    const res = await fetch(`/api/lessons/${editingLesson}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      setLessons((prev) =>
        prev.map((l) => (l.id === editingLesson ? { ...l, ...editForm } : l))
      );
      setEditingLesson(null);
    }
  };

  if (loading) return <div className="p-6 text-gray-400">読み込み中...</div>;
  if (!content) return <div className="p-6 text-red-400">教材が見つかりません</div>;

  return (
    <div className="p-6 bg-surface min-h-screen space-y-6">
      {/* ヘッダー */}
      <div>
        <Link href="/admin/contents" className="text-gray-400 hover:text-gray-300 text-sm mb-2 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          教材一覧に戻る
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">{content.title}</h1>
        <p className="text-sm text-gray-400 mt-1">
          {content.category} / {lessons.length}レッスン
        </p>
      </div>

      {/* レッスン追加 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">レッスン一覧</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          レッスン追加
        </button>
      </div>

      {showCreate && (
        <div className="bg-surface-card border border-white/10 rounded-xl p-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">タイトル</label>
            <input
              type="text"
              value={newLesson.title}
              onChange={(e) => setNewLesson((p) => ({ ...p, title: e.target.value }))}
              placeholder="例: 第1章 フェルミ推定の基礎"
              className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">種類</label>
            <select
              value={newLesson.lesson_type}
              onChange={(e) => setNewLesson((p) => ({ ...p, lesson_type: e.target.value }))}
              className="px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm"
            >
              {LESSON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <button onClick={handleCreateLesson} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
            追加
          </button>
        </div>
      )}

      {/* レッスン一覧 */}
      <div className="space-y-2">
        {lessons.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-surface-card border border-white/10 rounded-xl">
            レッスンがありません。「レッスン追加」から追加してください。
          </div>
        ) : (
          lessons.map((lesson, i) => (
            <div key={lesson.id} className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
              {/* レッスンヘッダー */}
              <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/[0.02]"
                onClick={() => editingLesson === lesson.id ? setEditingLesson(null) : startEdit(lesson)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-6 text-right">{i + 1}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    lesson.lesson_type === "動画" ? "bg-purple-900/30 text-purple-400" :
                    lesson.lesson_type === "リンク" ? "bg-blue-900/30 text-blue-400" :
                    "bg-gray-700/30 text-gray-400"
                  }`}>
                    {lesson.lesson_type}
                  </span>
                  <span className="text-sm text-white font-medium">{lesson.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  {lesson.duration_minutes && (
                    <span className="text-xs text-gray-500">{lesson.duration_minutes}分</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteLesson(lesson.id, lesson.title); }}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 編集フォーム */}
              {editingLesson === lesson.id && (
                <div className="px-4 pb-4 border-t border-white/10 pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">タイトル</label>
                      <input
                        type="text"
                        value={editForm.title || ""}
                        onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                        className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">種類</label>
                      <select
                        value={editForm.lesson_type || "テキスト"}
                        onChange={(e) => setEditForm((p) => ({ ...p, lesson_type: e.target.value }))}
                        className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm"
                      >
                        {LESSON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {(editForm.lesson_type === "動画") && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">動画URL（YouTube / Google Drive）</label>
                      <input
                        type="url"
                        value={editForm.video_url || ""}
                        onChange={(e) => setEditForm((p) => ({ ...p, video_url: e.target.value }))}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand focus:outline-none"
                      />
                    </div>
                  )}

                  {(editForm.lesson_type === "リンク") && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">外部リンクURL</label>
                      <input
                        type="url"
                        value={editForm.content_url || ""}
                        onChange={(e) => setEditForm((p) => ({ ...p, content_url: e.target.value }))}
                        placeholder="https://note.com/..."
                        className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand focus:outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">コンテンツ（HTML / マークダウン）</label>
                    <textarea
                      value={editForm.markdown_content || ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, markdown_content: e.target.value }))}
                      rows={12}
                      className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm font-mono focus:ring-2 focus:ring-brand focus:outline-none"
                      placeholder="HTMLまたはマークダウンでコンテンツを記述..."
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingLesson(null)}
                      className="px-4 py-2 text-gray-400 hover:text-white text-sm"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
