"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Clock, Video, FileText, ChevronDown, ChevronRight, Users, Play, CheckCircle, Eye, Circle } from "lucide-react";
import { useState } from "react";
import type { Course, Module, Lesson } from "@/types/database";

const typeIcons: Record<string, typeof Video> = {
  "動画": Video, "テキスト": FileText, "ケース演習": BookOpen, "模擬面接": Users, "課題": FileText,
};

const levelLabels: Record<string, string> = { beginner: "初級", intermediate: "中級", advanced: "上級" };

interface Props {
  course: Course | null;
  modules: (Module & { lessons: Lesson[] })[];
  slug: string;
  progressMap: Record<string, string>;
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

export function CourseDetailClient({ course, modules, slug, progressMap }: Props) {
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

  // 最後に閲覧中/進行中のレッスンを探す、なければ最初のレッスン
  const allLessons = modules.flatMap((m) => m.lessons || []);
  const lastInProgress = allLessons.find((l) => progressMap[l.id] === "進行中");
  const firstUnstarted = allLessons.find((l) => !progressMap[l.id] || progressMap[l.id] === "未着手");
  const resumeLesson = lastInProgress || firstUnstarted || allLessons[0];

  return (
    <div className="p-6 bg-surface min-h-screen">
      <Link href="/courses" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />コース一覧
      </Link>

      <div className="bg-gradient-to-r from-brand to-purple-700 rounded-xl p-8 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white">{levelLabels[course.level || ""] || course.level}</span>
          {course.category && <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white">{course.category}</span>}
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">{course.title}</h1>
        <p className="text-white/80 mb-4">{course.description || ""}</p>
        <div className="flex items-center gap-6 text-sm text-white/70 mb-4">
          <span className="flex items-center gap-1"><BookOpen className="w-4 h-4" />{totalLessons}レッスン</span>
          <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{course.duration_weeks}週間</span>
          {completedLessons > 0 && (
            <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" />{completedLessons}/{totalLessons} 完了</span>
          )}
        </div>
        {/* 進捗バー */}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <h2 className="text-xl font-bold text-white mb-4">カリキュラム</h2>
          {modules.length === 0 ? (
            <p className="text-gray-400 text-sm">まだモジュールが追加されていません</p>
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
        <div>
          <div className="bg-surface-elevated rounded-xl p-6 sticky top-6">
            <h3 className="text-lg font-bold text-white mb-3">
              {progressPercent > 0 ? "学習を続ける" : "受講中"}
            </h3>
            {progressPercent > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-400">進捗</span>
                  <span className="text-white font-medium">{progressPercent}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
            <p className="text-sm text-gray-400 mb-4">
              {progressPercent === 100
                ? "全レッスン完了！おめでとうございます！"
                : progressPercent > 0
                  ? "前回の続きから学習を再開しましょう"
                  : "このコースで学習を進めましょう"}
            </p>
            {resumeLesson && (
              <Link href={`/courses/${slug}/learn/${resumeLesson.id}`} className="w-full bg-brand hover:bg-brand-dark text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                <Play className="w-4 h-4" />{progressPercent > 0 ? "続きから学習" : "学習を始める"}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
