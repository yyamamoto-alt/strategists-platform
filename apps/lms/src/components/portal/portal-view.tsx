"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ExternalLink, BookOpen, Video, FileText, ChevronRight, Lock } from "lucide-react";
import type { Course } from "@/types/database";

interface FormItem {
  id: string;
  title: string;
  url: string;
  plan_ids: string[];
}

interface PortalViewProps {
  courses: Course[];
  lockedCourses?: Course[];
  planId?: string | null;
}

function groupByCategory(courses: Course[]): Record<string, Course[]> {
  const groups: Record<string, Course[]> = {};
  for (const course of courses) {
    const cat = course.category || "その他";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(course);
  }
  return groups;
}

const sectionConfig: { category: string; icon: string; color: string }[] = [
  { category: "ガイド", icon: "📖", color: "bg-emerald-500" },
  { category: "教科書", icon: "📚", color: "bg-blue-500" },
  { category: "動画講座", icon: "🎬", color: "bg-purple-500" },
  { category: "補助教材", icon: "📎", color: "bg-gray-500" },
  { category: "カリキュラム", icon: "📋", color: "bg-amber-500" },
];

const categoryIcons: Record<string, typeof BookOpen> = {
  "教科書": BookOpen,
  "動画講座": Video,
  "補助教材": FileText,
  "ガイド": BookOpen,
  "カリキュラム": FileText,
};


function CourseRow({ course, locked = false }: { course: Course; locked?: boolean }) {
  const Icon = categoryIcons[course.category || ""] || FileText;
  const slug = course.slug || course.id;

  if (locked) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 text-gray-500 cursor-not-allowed">
        <Lock className="w-4 h-4 shrink-0" />
        <span className="text-sm truncate">{course.title}</span>
        <span className="text-xs text-gray-600 ml-auto shrink-0">プランアップグレードで利用可能</span>
      </div>
    );
  }

  return (
    <Link
      href={`/courses/${slug}`}
      className="flex items-center gap-3 px-3 py-2 rounded hover:bg-white/[0.04] transition-colors group"
    >
      <Icon className="w-4 h-4 text-gray-500 shrink-0" />
      <span className="text-sm text-gray-200 group-hover:text-white truncate">{course.title}</span>
      {course.total_lessons > 0 && (
        <span className="text-xs text-gray-600 shrink-0">{course.total_lessons}件</span>
      )}
      <ChevronRight className="w-3.5 h-3.5 text-gray-600 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

export function PortalView({ courses, lockedCourses = [], planId }: PortalViewProps) {
  const [forms, setForms] = useState<FormItem[]>([]);

  useEffect(() => {
    fetch("/api/forms")
      .then((r) => r.ok ? r.json() : [])
      .then((data: FormItem[]) => {
        // プランでフィルタ: plan_ids が空なら全員表示、あればマッチするもののみ
        const filtered = data.filter((f) =>
          f.plan_ids.length === 0 || !planId || f.plan_ids.includes(planId)
        );
        setForms(filtered);
      })
      .catch(() => {});
  }, [planId]);

  const grouped = groupByCategory(courses);
  const lockedGrouped = groupByCategory(lockedCourses);

  const allCategories = new Set([
    ...Object.keys(grouped),
    ...Object.keys(lockedGrouped),
  ]);

  // sectionConfigの順序に従い、未定義カテゴリは末尾に
  const orderedCategories = [
    ...sectionConfig.filter((s) => allCategories.has(s.category)).map((s) => s.category),
    ...Array.from(allCategories).filter((c) => !sectionConfig.some((s) => s.category === c)),
  ];

  return (
    <div className="p-5 bg-surface min-h-screen max-w-4xl">
      <h1 className="text-lg font-bold text-white mb-4">学習ポータル</h1>

      {orderedCategories.map((category) => {
        const catCourses = grouped[category] || [];
        const catLocked = lockedGrouped[category] || [];
        if (catCourses.length === 0 && catLocked.length === 0) return null;

        const config = sectionConfig.find((s) => s.category === category);
        const icon = config?.icon || "📁";
        const color = config?.color || "bg-gray-500";

        return (
          <div key={category} className="mb-5">
            <div className="flex items-center gap-2 mb-1 px-1">
              <span className={`w-1.5 h-4 rounded-sm ${color}`} />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {icon} {category}
              </span>
              <span className="text-xs text-gray-600">{catCourses.length + catLocked.length}</span>
            </div>
            <div className="border border-white/[0.06] rounded-lg divide-y divide-white/[0.04] bg-white/[0.02]">
              {catCourses.map((course) => (
                <CourseRow key={course.id} course={course} />
              ))}
              {catLocked.map((course) => (
                <CourseRow key={course.id} course={course} locked />
              ))}
            </div>
          </div>
        );
      })}

      {/* 各種フォーム */}
      {forms.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1 px-1">
            <span className="w-1.5 h-4 rounded-sm bg-orange-500" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              📝 各種フォーム
            </span>
            <span className="text-xs text-gray-600">{forms.length}</span>
          </div>
          <div className="border border-white/[0.06] rounded-lg divide-y divide-white/[0.04] bg-white/[0.02]">
            {forms.map((form) => (
              <a
                key={form.id}
                href={form.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-white/[0.04] transition-colors group"
              >
                <ExternalLink className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-sm text-gray-200 group-hover:text-white">{form.title}</span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-600 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      )}

      {courses.length === 0 && lockedCourses.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>コンテンツはまだ追加されていません</p>
        </div>
      )}
    </div>
  );
}
