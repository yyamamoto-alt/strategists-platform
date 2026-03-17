"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft, GripVertical, Video } from "lucide-react";
import dynamic from "next/dynamic";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const RichEditor = dynamic(
  () => import("@/components/content/rich-editor").then((m) => m.RichEditor),
  {
    ssr: false,
    loading: () => (
      <div className="border border-white/10 rounded-lg overflow-hidden bg-surface">
        <div className="animate-pulse bg-white/[0.03] min-h-[300px] rounded-lg" />
      </div>
    ),
  }
);

interface LessonVideo {
  title: string;
  url: string;
  duration_minutes?: number;
  description?: string;
}

interface Lesson {
  id: string;
  title: string;
  lesson_type: string;
  content_format: string | null;
  markdown_content: string | null;
  video_url: string | null;
  video_urls: LessonVideo[];
  content_url: string | null;
  sort_order: number;
  duration_minutes: number | null;
  module_id: string | null;
  thumbnail_url: string | null;
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
  const { addToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

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

  const handleDeleteLesson = (lessonId: string, title: string) => {
    setDeleteTarget({ id: lessonId, title });
  };

  const confirmDeleteLesson = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/lessons/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setLessons((prev) => prev.filter((l) => l.id !== deleteTarget.id));
      addToast("レッスンを削除しました", "success");
    }
    setDeleteTarget(null);
  };

  const startEdit = (lesson: Lesson) => {
    setEditingLesson(lesson.id);
    setEditForm({
      title: lesson.title,
      lesson_type: lesson.lesson_type,
      markdown_content: lesson.markdown_content || "",
      video_url: lesson.video_url || "",
      video_urls: lesson.video_urls || [],
      content_url: lesson.content_url || "",
      duration_minutes: lesson.duration_minutes,
      thumbnail_url: lesson.thumbnail_url || "",
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
      addToast("保存しました", "success");
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
                  {lesson.thumbnail_url && (
                    <img src={lesson.thumbnail_url} alt="" className="w-8 h-10 object-cover rounded border border-white/10" />
                  )}
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

                  {/* サムネイル */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">サムネイルURL（画像）</label>
                    <div className="flex gap-3 items-start">
                      <input
                        type="url"
                        value={editForm.thumbnail_url || ""}
                        onChange={(e) => setEditForm((p) => ({ ...p, thumbnail_url: e.target.value }))}
                        placeholder="https://example.com/image.jpg"
                        className="flex-1 px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand focus:outline-none"
                      />
                      {editForm.thumbnail_url && (
                        <img
                          src={editForm.thumbnail_url}
                          alt="サムネイルプレビュー"
                          className="w-16 h-20 object-cover rounded border border-white/10"
                        />
                      )}
                    </div>
                  </div>

                  {(editForm.lesson_type === "動画") && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">メイン動画URL（単一動画の場合）</label>
                        <input
                          type="url"
                          value={editForm.video_url || ""}
                          onChange={(e) => setEditForm((p) => ({ ...p, video_url: e.target.value }))}
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand focus:outline-none"
                        />
                      </div>

                      {/* 複数動画管理 */}
                      <div className="border border-white/10 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs text-gray-400">
                            <Video className="w-3.5 h-3.5" />
                            複数動画管理（動画講座用）
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const current = editForm.video_urls || [];
                              setEditForm((p) => ({
                                ...p,
                                video_urls: [...current, { title: "", url: "" }],
                              }));
                            }}
                            className="flex items-center gap-1 text-xs text-brand hover:text-brand-light transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            動画を追加
                          </button>
                        </div>

                        {(editForm.video_urls || []).length === 0 ? (
                          <p className="text-xs text-gray-500">動画が追加されていません。複数動画がある場合はここで管理できます。</p>
                        ) : (
                          <div className="space-y-2">
                            {(editForm.video_urls || []).map((video: LessonVideo, idx: number) => (
                              <div key={idx} className="flex gap-2 items-start bg-surface rounded-lg p-2">
                                <span className="text-xs text-gray-500 mt-2 w-5 text-right shrink-0">{idx + 1}</span>
                                <div className="flex-1 grid grid-cols-[1fr_2fr_4rem] gap-2">
                                  <input
                                    type="text"
                                    value={video.title}
                                    onChange={(e) => {
                                      const arr = [...(editForm.video_urls || [])];
                                      arr[idx] = { ...arr[idx], title: e.target.value };
                                      setEditForm((p) => ({ ...p, video_urls: arr }));
                                    }}
                                    placeholder="タイトル"
                                    className="px-2 py-1.5 bg-surface-elevated border border-white/10 rounded text-white text-xs focus:ring-1 focus:ring-brand focus:outline-none"
                                  />
                                  <input
                                    type="url"
                                    value={video.url}
                                    onChange={(e) => {
                                      const arr = [...(editForm.video_urls || [])];
                                      arr[idx] = { ...arr[idx], url: e.target.value };
                                      setEditForm((p) => ({ ...p, video_urls: arr }));
                                    }}
                                    placeholder="YouTube / Google Drive URL"
                                    className="px-2 py-1.5 bg-surface-elevated border border-white/10 rounded text-white text-xs focus:ring-1 focus:ring-brand focus:outline-none"
                                  />
                                  <input
                                    type="number"
                                    value={video.duration_minutes || ""}
                                    onChange={(e) => {
                                      const arr = [...(editForm.video_urls || [])];
                                      arr[idx] = { ...arr[idx], duration_minutes: e.target.value ? Number(e.target.value) : undefined };
                                      setEditForm((p) => ({ ...p, video_urls: arr }));
                                    }}
                                    placeholder="分"
                                    className="px-2 py-1.5 bg-surface-elevated border border-white/10 rounded text-white text-xs focus:ring-1 focus:ring-brand focus:outline-none"
                                  />
                                </div>
                                <div className="flex flex-col gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => {
                                      const arr = [...(editForm.video_urls || [])];
                                      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                      setEditForm((p) => ({ ...p, video_urls: arr }));
                                    }}
                                    className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20 transition-colors"
                                  >
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === (editForm.video_urls || []).length - 1}
                                    onClick={() => {
                                      const arr = [...(editForm.video_urls || [])];
                                      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                      setEditForm((p) => ({ ...p, video_urls: arr }));
                                    }}
                                    className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20 transition-colors"
                                  >
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const arr = (editForm.video_urls || []).filter((_: LessonVideo, i: number) => i !== idx);
                                    setEditForm((p) => ({ ...p, video_urls: arr }));
                                  }}
                                  className="p-1 text-gray-500 hover:text-red-400 transition-colors mt-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
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
                    <label className="block text-xs text-gray-400 mb-1">コンテンツ</label>
                    <RichEditor
                      content={editForm.markdown_content || ""}
                      onChange={(html) => setEditForm((p) => ({ ...p, markdown_content: html, content_format: "html" }))}
                      placeholder="ここにコンテンツを入力..."
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="レッスンの削除"
        message={`「${deleteTarget?.title || ""}」を削除しますか？この操作は取り消せません。`}
        confirmLabel="削除"
        destructive
        onConfirm={confirmDeleteLesson}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
