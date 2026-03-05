"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, X, Plus } from "lucide-react";

interface Course {
  id: string;
  title: string;
  target_attribute: string | null;
  content_ids: string[];
}

interface Content {
  id: string;
  title: string;
  category: string | null;
  target_attribute: string | null;
}

export default function CoursesAdminPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContentIds, setEditContentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTarget, setNewTarget] = useState("既卒");
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    const [coursesRes, contentsRes] = await Promise.all([
      fetch("/api/admin/courses"),
      fetch("/api/admin/contents"),
    ]);
    if (coursesRes.ok) setCourses(await coursesRes.json());
    if (contentsRes.ok) setContents(await contentsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    const res = await fetch("/api/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, target_attribute: newTarget }),
    });
    if (res.ok) {
      const newCourse = await res.json();
      setCourses((prev) => [...prev, newCourse]);
      setNewTitle("");
      setShowCreate(false);
    }
    setCreating(false);
  };

  const startEdit = (course: Course) => {
    setEditingId(course.id);
    setEditContentIds([...course.content_ids]);
  };

  const toggleContent = (contentId: string) => {
    setEditContentIds((prev) =>
      prev.includes(contentId)
        ? prev.filter((c) => c !== contentId)
        : [...prev, contentId]
    );
  };

  const saveContents = async () => {
    if (!editingId) return;
    setSaving(true);
    await fetch(`/api/admin/courses/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_ids: editContentIds }),
    });
    setCourses((prev) =>
      prev.map((c) => (c.id === editingId ? { ...c, content_ids: editContentIds } : c))
    );
    setEditingId(null);
    setSaving(false);
  };

  if (loading) return <div className="p-6 text-gray-400">読み込み中...</div>;

  return (
    <div className="p-6 bg-surface min-h-screen space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">コース管理</h1>
          <p className="text-sm text-gray-400 mt-1">各コース（カリキュラム）に含める教材を選択</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          コースを追加
        </button>
      </div>

      {showCreate && (
        <div className="bg-surface-card border border-white/10 rounded-xl p-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">コース名</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="例: 新卒スタンダード"
              className="w-full px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">対象</label>
            <select
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm"
            >
              <option value="既卒">既卒</option>
              <option value="新卒">新卒</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {creating ? "作成中..." : "追加"}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {courses.map((course) => {
          const isEditing = editingId === course.id;
          const courseContents = contents.filter((c) => course.content_ids.includes(c.id));

          return (
            <div key={course.id} className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
              {/* ヘッダー */}
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-white">{course.title}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    course.target_attribute === "新卒"
                      ? "bg-blue-900/30 text-blue-400"
                      : "bg-amber-900/30 text-amber-400"
                  }`}>
                    {course.target_attribute}
                  </span>
                  <span className="text-xs text-gray-500">
                    {course.content_ids.length}教材
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={saveContents}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        保存
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex items-center gap-1 px-3 py-1.5 text-gray-400 hover:text-white text-xs"
                      >
                        <X className="w-3.5 h-3.5" />
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEdit(course)}
                      className="px-3 py-1.5 bg-brand/20 text-brand hover:bg-brand/30 rounded-lg text-xs font-medium transition-colors"
                    >
                      教材を選択
                    </button>
                  )}
                </div>
              </div>

              {/* 教材一覧 */}
              <div className="p-4">
                {isEditing ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {contents.map((content) => {
                      const selected = editContentIds.includes(content.id);
                      return (
                        <button
                          key={content.id}
                          onClick={() => toggleContent(content.id)}
                          className={`text-left p-3 rounded-lg border transition-colors ${
                            selected
                              ? "bg-brand/10 border-brand/30 text-white"
                              : "bg-surface-elevated border-white/5 text-gray-400 hover:border-white/20"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${
                              selected ? "bg-brand border-brand" : "border-white/20"
                            }`}>
                              {selected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{content.title}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                {content.category} / {content.target_attribute}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : courseContents.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {courseContents.map((c) => (
                      <span key={c.id} className="text-xs px-2.5 py-1 rounded-lg bg-surface-elevated border border-white/10 text-gray-300">
                        {c.title}
                        {c.category && <span className="text-gray-500 ml-1">({c.category})</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">教材が選択されていません</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
