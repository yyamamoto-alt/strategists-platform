"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, BookOpen, Clock, LayoutList, LayoutGrid } from "lucide-react";
import { CurriculumTable } from "@/components/curriculum/curriculum-table";
import { PortalView } from "@/components/portal/portal-view";
import type { Course, Module, Lesson, LessonProgress } from "@/types/database";

const levelLabels: Record<string, string> = {
  beginner: "初級", intermediate: "中級", advanced: "上級",
};

const levelColors: Record<string, string> = {
  beginner: "bg-green-900/50 text-green-300",
  intermediate: "bg-yellow-900/50 text-yellow-300",
  advanced: "bg-red-900/50 text-red-300",
};

interface CoursesClientProps {
  courses: Course[];
  viewMode: "curriculum" | "portal";
  targetAttribute: string | null;
  modules: Record<string, Module[]>;
  lessons: Record<string, Lesson[]>;
  progress: Record<string, LessonProgress>;
}

export function CoursesClient({
  courses,
  viewMode: initialViewMode,
  targetAttribute,
  modules,
  lessons,
  progress,
}: CoursesClientProps) {
  const [viewMode, setViewMode] = useState(initialViewMode);

  // カリキュラムビュー
  if (viewMode === "curriculum") {
    return (
      <div>
        {/* ビュー切り替えボタン（両方のビューを体験可能に） */}
        <div className="px-6 pt-4 flex justify-end">
          <button
            onClick={() => setViewMode("portal")}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            ポータル表示
          </button>
        </div>
        <CurriculumTable
          courses={courses}
          modules={modules}
          lessons={lessons}
          progress={progress}
        />
      </div>
    );
  }

  // ポータルビュー
  if (viewMode === "portal") {
    return (
      <div>
        {/* 新卒ユーザーにカリキュラム表示への切り替えを提供 */}
        {targetAttribute === "新卒" && (
          <div className="px-6 pt-4 flex justify-end">
            <button
              onClick={() => setViewMode("curriculum")}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <LayoutList className="w-3.5 h-3.5" />
              カリキュラム表示
            </button>
          </div>
        )}
        <PortalView courses={courses} />
      </div>
    );
  }

  // フォールバック: 既存のカードグリッドビュー
  return <DefaultGridView courses={courses} />;
}

// 既存のグリッドビュー（フォールバック）
function DefaultGridView({ courses }: { courses: Course[] }) {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  const filtered = courses.filter((c) => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    const matchLevel = !levelFilter || c.level === levelFilter;
    return matchSearch && matchLevel;
  });

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">コース一覧</h1>
          <p className="text-sm text-gray-400 mt-1">受講可能なコースを見る</p>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="コース名で検索..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-surface-elevated border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand" />
        </div>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="bg-surface-elevated border border-white/10 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-brand">
          <option value="">全レベル</option>
          <option value="beginner">初級</option>
          <option value="intermediate">中級</option>
          <option value="advanced">上級</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>コースが見つかりません</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((course) => (
            <Link key={course.id} href={`/courses/${course.slug || course.id}`} className="bg-surface-elevated rounded-xl overflow-hidden hover:ring-2 hover:ring-brand transition-all group">
              <div className="h-40 bg-gradient-to-br from-brand to-purple-700 flex items-center justify-center">
                <BookOpen className="w-12 h-12 text-white/50" />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${levelColors[course.level || ""] || ""}`}>
                    {levelLabels[course.level || ""] || course.level}
                  </span>
                  {course.category && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">{course.category}</span>
                  )}
                </div>
                <h3 className="text-white font-semibold mb-1 group-hover:text-brand-light transition-colors">{course.title}</h3>
                <p className="text-sm text-gray-400 line-clamp-2 mb-3">{course.description || "説明なし"}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.total_lessons}レッスン</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration_weeks}週間</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
