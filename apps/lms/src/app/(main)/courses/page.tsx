"use client";

import { useState } from "react";
import Link from "next/link";
import { mockCourses } from "@/lib/mock-data";
import { Search, Plus, BookOpen, Clock } from "lucide-react";

const levelLabels: Record<string, string> = {
  beginner: "初級", intermediate: "中級", advanced: "上級",
};

const levelColors: Record<string, string> = {
  beginner: "bg-green-900/50 text-green-300",
  intermediate: "bg-yellow-900/50 text-yellow-300",
  advanced: "bg-red-900/50 text-red-300",
};

export default function CoursesPage() {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  const filtered = mockCourses.filter((c) => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    const matchLevel = !levelFilter || c.level === levelFilter;
    return matchSearch && matchLevel;
  });

  return (
    <div className="p-6 bg-gray-950 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">コース一覧</h1>
          <p className="text-sm text-gray-400 mt-1">受講可能なコースを見る</p>
        </div>
        <Link href="/courses/new" className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />
          コースを作成
        </Link>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="コース名で検索..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500" />
        </div>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-primary-500">
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
            <Link key={course.id} href={`/courses/${course.slug || course.id}`} className="bg-gray-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all group">
              <div className="h-40 bg-gradient-to-br from-primary-600 to-purple-700 flex items-center justify-center">
                <BookOpen className="w-12 h-12 text-white/50" />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${levelColors[course.level || ""] || ""}`}>
                    {levelLabels[course.level || ""] || course.level}
                  </span>
                  {course.category && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">{course.category}</span>
                  )}
                </div>
                <h3 className="text-white font-semibold mb-1 group-hover:text-primary-400 transition-colors">{course.title}</h3>
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
