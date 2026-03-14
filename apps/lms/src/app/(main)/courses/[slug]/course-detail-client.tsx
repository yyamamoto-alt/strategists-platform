"use client";

import Link from "next/link";
import { BookOpen, Clock, Video, FileText, ChevronDown, ChevronRight, Users, CheckCircle, Eye, Circle, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { Course, Module, Lesson } from "@/types/database";

const typeIcons: Record<string, typeof Video> = {
  "動画": Video, "テキスト": FileText, "ケース演習": BookOpen, "模擬面接": Users, "課題": FileText,
};

interface FormItem {
  id: string;
  title: string;
  url: string;
  description: string | null;
}

interface Props {
  course: Course | null;
  modules: (Module & { lessons: Lesson[] })[];
  slug: string;
  progressMap: Record<string, string>;
  forms: FormItem[];
}

function statusIcon(s: string) {
  switch (s) {
    case "完了":
      return <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />;
    case "閲覧済み":
      return <Eye className="w-4 h-4 text-blue-400 shrink-0" />;
    case "進行中":
      return <Circle className="w-4 h-4 text-yellow-400 shrink-0" />;
    default:
      return null;
  }
}

export function CourseDetailClient({ course, modules, slug, progressMap, forms }: Props) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    () => new Set(modules.map((m) => m.id))
  );

  const toggleModule = (id: string) => {
    setExpandedModules((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  if (!course) {
    return (
      <div className="p-6 bg-surface min-h-screen text-center py-20">
        <p className="text-gray-400">コースが見つかりません</p>
        <Link href="/courses" className="text-brand-light hover:underline text-sm mt-2 inline-block">コース一覧に戻る</Link>
      </div>
    );
  }

  const totalLessons = modules.reduce((sum, m) => sum + (m.lessons?.length || 0), 0);
  const completedLessons = modules.reduce(
    (sum, m) => sum + (m.lessons || []).filter((l) => progressMap[l.id] === "完了" || progressMap[l.id] === "閲覧済み").length,
    0
  );
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const allLessons = modules.flatMap((m) => m.lessons || []);
  const lastInProgress = allLessons.find((l) => progressMap[l.id] === "進行中");
  const firstUnstarted = allLessons.find((l) => !progressMap[l.id] || progressMap[l.id] === "未着手");
  const resumeLesson = lastInProgress || firstUnstarted || allLessons[0];

  return (
    <div className="p-6 bg-surface min-h-screen">
      {/* コースヘッダー */}
      <div className="bg-gradient-to-r from-brand to-[#0a0a0a] rounded-xl p-8 mb-8">
        <div className="flex items-center gap-2 mb-3">
          {course.category && <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white">{course.category}</span>}
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">{course.title}</h1>
        <p className="text-white/80 mb-4">{course.description || ""}</p>
        <div className="flex items-center gap-6 text-sm text-white/70 mb-4">
          <span className="flex items-center gap-1"><BookOpen className="w-4 h-4" />{totalLessons}レッスン</span>
          {course.duration_weeks && <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{course.duration_weeks}週間</span>}
          {completedLessons > 0 && (
            <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" />{completedLessons}/{totalLessons} 完了</span>
          )}
        </div>
        {totalLessons > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-sm text-white/80 font-medium">{progressPercent}%</span>
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto">
        <div className="space-y-8">
          {/* カリキュラム */}
          <div>
            {modules.length === 0 ? (
              <p className="text-gray-400 text-sm">まだ教材が追加されていません</p>
            ) : (
              <div className="space-y-3">
                {modules.map((mod) => {
                  const isExpanded = expandedModules.has(mod.id);
                  const lessons = mod.lessons || [];
                  const modCompleted = lessons.filter((l) => progressMap[l.id] === "完了" || progressMap[l.id] === "閲覧済み").length;
                  return (
                    <div key={mod.id} className="bg-surface-elevated rounded-lg overflow-hidden">
                      <button onClick={() => toggleModule(mod.id)} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                          <span className="text-white font-medium">{mod.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {modCompleted > 0 && (
                            <span className="text-xs text-green-400">{modCompleted}/{lessons.length}</span>
                          )}
                          <span className="text-xs text-gray-400">{lessons.length}レッスン</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-white/10">
                          {lessons.sort((a, b) => a.sort_order - b.sort_order).map((lesson) => {
                            const Icon = typeIcons[lesson.lesson_type] || FileText;
                            const sIcon = statusIcon(progressMap[lesson.id]);
                            return (
                              <div key={lesson.id} className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.08] last:border-0">
                                {sIcon || <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
                                <Link href={`/courses/${slug}/learn/${lesson.id}`} className="text-sm text-gray-300 hover:text-brand-light flex-1 transition-colors">{lesson.title}</Link>
                                {lesson.duration_minutes && <span className="text-xs text-gray-500">{lesson.duration_minutes}分</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 各種フォーム */}
          {forms.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-4">各種フォーム</h2>
              <div className="space-y-2">
                {forms.map((form) => (
                  <a
                    key={form.id}
                    href={form.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 bg-surface-elevated rounded-lg px-5 py-3.5 hover:bg-white/[0.06] transition-colors group"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 group-hover:text-white font-medium">{form.title}</p>
                      {form.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{form.description}</p>
                      )}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
