"use client";

import { useState } from "react";
import { LayoutList, LayoutGrid } from "lucide-react";
import { CurriculumTable } from "@/components/curriculum/curriculum-table";
import { PortalView } from "@/components/portal/portal-view";
import type { Course, Module, Lesson, LessonProgress } from "@/types/database";

interface CoursesClientProps {
  courses: Course[];
  lockedCourses?: Course[];
  viewMode: "curriculum" | "portal";
  targetAttribute: string | null;
  planName?: string | null;
  planId?: string | null;
  modules: Record<string, Module[]>;
  lessons: Record<string, Lesson[]>;
  progress: Record<string, LessonProgress>;
  noAccessMessage?: string | null;
}

export function CoursesClient({
  courses,
  lockedCourses = [],
  viewMode: initialViewMode,
  targetAttribute,
  planName,
  planId,
  modules,
  lessons,
  progress,
  noAccessMessage,
}: CoursesClientProps) {
  const [viewMode, setViewMode] = useState(initialViewMode);

  // コースアクセス権なしの場合
  if (noAccessMessage && courses.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-surface-elevated border border-white/10 flex items-center justify-center">
            <LayoutList className="w-7 h-7 text-gray-500" />
          </div>
          <p className="text-gray-400 text-sm">{noAccessMessage}</p>
        </div>
      </div>
    );
  }

  // カリキュラムビュー
  if (viewMode === "curriculum") {
    return (
      <div>
        <div className="px-6 pt-4 flex items-center justify-between">
          {planName && (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full bg-brand/20 text-brand-light border border-brand/30 font-medium">
                {planName}
              </span>
            </div>
          )}
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
  return (
    <div>
      {targetAttribute === "新卒" && (
        <div className="px-6 pt-4 flex items-center justify-between">
          {planName && (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full bg-brand/20 text-brand-light border border-brand/30 font-medium">
                {planName}
              </span>
            </div>
          )}
          <button
            onClick={() => setViewMode("curriculum")}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <LayoutList className="w-3.5 h-3.5" />
            カリキュラム表示
          </button>
        </div>
      )}
      {!targetAttribute && planName && (
        <div className="px-6 pt-4">
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand/20 text-brand-light border border-brand/30 font-medium">
            {planName}
          </span>
        </div>
      )}
      <PortalView courses={courses} lockedCourses={lockedCourses} planId={planId} />
    </div>
  );
}
