"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Trash2, BookOpen, Check, AlertCircle } from "lucide-react";
import type { Course } from "@/types/database";

const statusLabels: Record<string, string> = {
  draft: "下書き",
  published: "公開中",
  archived: "非公開",
};

const statusColors: Record<string, string> = {
  draft: "bg-yellow-900/50 text-yellow-300",
  published: "bg-green-900/50 text-green-300",
  archived: "bg-gray-700/50 text-gray-400",
};

const levelLabels: Record<string, string> = {
  beginner: "初級",
  intermediate: "中級",
  advanced: "上級",
};

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm ${
      type === "success" ? "bg-green-900/90 text-green-200" : "bg-red-900/90 text-red-200"
    }`}>
      {type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {message}
    </div>
  );
}

export default function CourseManagePage() {
  const { role } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchCourses = useCallback(async () => {
    try {
      const res = await fetch("/api/courses");
      if (res.ok) {
        const data = await res.json();
        setCourses(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  if (role !== "admin") {
    return (
      <div className="p-6 bg-surface min-h-screen text-center py-20">
        <p className="text-gray-400">管理者のみアクセスできます</p>
      </div>
    );
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？関連するモジュール・レッスンも全て削除されます。`)) return;
    const res = await fetch(`/api/courses/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCourses((prev) => prev.filter((c) => c.id !== id));
      setToast({ message: `「${title}」を削除しました`, type: "success" });
    } else {
      setToast({ message: "削除に失敗しました", type: "error" });
    }
  };

  return (
    <div className="p-6 bg-surface min-h-screen">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">コース管理</h1>
          <p className="text-sm text-gray-400 mt-1">コースの作成・編集・削除</p>
        </div>
        <Link
          href="/admin/courses/new"
          className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          新規コース作成
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : courses.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg mb-2">コースがまだありません</p>
          <p className="text-sm text-gray-500 mb-6">最初のコースを作成しましょう</p>
          <Link
            href="/admin/courses/new"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            コースを作成
          </Link>
        </div>
      ) : (
        <div className="bg-surface-elevated rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">タイトル</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">レベル</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">ステータス</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">レッスン数</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">作成日</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/courses/${course.id}`} className="text-white hover:text-brand-light font-medium transition-colors">
                        {course.title}
                      </Link>
                      {course.category && (
                        <span className="ml-2 text-xs text-gray-500">{course.category}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {levelLabels[course.level || ""] || course.level || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[course.status || "draft"] || ""}`}>
                        {statusLabels[course.status || "draft"] || course.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{course.total_lessons}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(course.created_at).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/admin/courses/${course.id}`)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          title="編集"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(course.id, course.title)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
