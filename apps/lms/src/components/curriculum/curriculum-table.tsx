"use client";

import Link from "next/link";
import {
  BookOpen, Video, FileText, Users, MessageSquare, Calendar,
  CheckCircle, Circle,
} from "lucide-react";
import type { Course, Module, Lesson, LessonProgress } from "@/types/database";

// 教材種類→アイコン・ラベルマッピング
const lessonTypeConfig: Record<string, { icon: typeof Video; label: string; color: string }> = {
  "動画":       { icon: Video,          label: "動画",         color: "text-blue-400 bg-blue-900/30" },
  "テキスト":   { icon: FileText,       label: "教材",         color: "text-green-400 bg-green-900/30" },
  "ケース演習": { icon: BookOpen,        label: "ケース演習",   color: "text-orange-400 bg-orange-900/30" },
  "模擬面接":   { icon: Users,           label: "模擬面接",     color: "text-purple-400 bg-purple-900/30" },
  "課題":       { icon: MessageSquare,   label: "課題",         color: "text-yellow-400 bg-yellow-900/30" },
};

// チャプター(モジュール)の色分け
const chapterColors = [
  "border-l-blue-500",
  "border-l-green-500",
  "border-l-orange-500",
  "border-l-purple-500",
  "border-l-pink-500",
  "border-l-cyan-500",
  "border-l-yellow-500",
  "border-l-red-500",
];

interface CurriculumTableProps {
  courses: Course[];
  modules: Record<string, Module[]>;           // courseId → modules
  lessons: Record<string, Lesson[]>;           // moduleId → lessons
  progress: Record<string, LessonProgress>;    // lessonId → progress
}

export function CurriculumTable({
  courses,
  modules,
  lessons,
  progress,
}: CurriculumTableProps) {
  // 全レッスンをフラット化して番号付け
  const allItems: {
    number: number;
    lesson: Lesson;
    module: Module;
    course: Course;
  }[] = [];

  let itemNumber = 0;
  for (const course of courses) {
    const courseModules = modules[course.id] || [];
    for (const mod of courseModules) {
      const modLessons = lessons[mod.id] || [];
      for (const lesson of modLessons) {
        itemNumber++;
        allItems.push({ number: itemNumber, lesson, module: mod, course });
      }
    }
  }

  const completedCount = allItems.filter(
    (item) => progress[item.lesson.id]?.status === "完了"
  ).length;

  // モジュールでグルーピング
  const grouped = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const key = item.module.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">カリキュラム</h1>
          <p className="text-sm text-gray-400 mt-1">
            学習を進めましょう
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-400">
            進捗: <span className="text-white font-semibold">{completedCount}</span> / {allItems.length}
          </div>
          <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all"
              style={{ width: `${allItems.length > 0 ? (completedCount / allItems.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([moduleId, items], groupIndex) => {
          const moduleName = items[0].module.title;
          const colorClass = chapterColors[groupIndex % chapterColors.length];

          return (
            <div key={moduleId} className={`bg-surface-elevated rounded-xl overflow-hidden border-l-4 ${colorClass}`}>
              <div className="px-5 py-3 border-b border-white/10">
                <h2 className="text-base font-semibold text-white">{moduleName}</h2>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {items.map((item) => {
                  const typeConf = lessonTypeConfig[item.lesson.lesson_type] || lessonTypeConfig["テキスト"];
                  const Icon = typeConf.icon;
                  const prog = progress[item.lesson.id];
                  const isCompleted = prog?.status === "完了";
                  const courseSlug = item.course.slug || item.course.id;

                  return (
                    <Link
                      key={item.lesson.id}
                      href={`/courses/${courseSlug}/learn/${item.lesson.id}`}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.03] transition-colors group"
                    >
                      {/* 番号 */}
                      <span className="text-sm text-gray-500 w-6 text-right font-mono shrink-0">
                        {item.number}.
                      </span>

                      {/* 完了ステータス */}
                      {isCompleted ? (
                        <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-600 shrink-0" />
                      )}

                      {/* タイトル */}
                      <span className={`flex-1 text-sm ${isCompleted ? "text-gray-500 line-through" : "text-gray-200 group-hover:text-white"} transition-colors`}>
                        {item.lesson.title}
                      </span>

                      {/* 教材種類バッジ */}
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0 ${typeConf.color}`}>
                        <Icon className="w-3 h-3" />
                        {typeConf.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {allItems.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>カリキュラムはまだ設定されていません</p>
        </div>
      )}
    </div>
  );
}
