"use client";

import Link from "next/link";
import { BookOpen, Video, FileText, Lock } from "lucide-react";
import type { Course } from "@/types/database";

const categoryIcons: Record<string, typeof BookOpen> = {
  "教科書": BookOpen,
  "動画講座": Video,
  "補助教材": FileText,
};

const categoryGradients: Record<string, string> = {
  "教科書": "from-blue-600 to-blue-800",
  "動画講座": "from-purple-600 to-purple-800",
  "補助教材": "from-gray-600 to-gray-800",
};

interface ContentCardProps {
  course: Course;
  locked?: boolean;
}

export function ContentCard({ course, locked = false }: ContentCardProps) {
  const Icon = categoryIcons[course.category || ""] || BookOpen;
  const gradient = categoryGradients[course.category || ""] || "from-brand to-purple-700";
  const courseSlug = course.slug || course.id;

  if (locked) {
    return (
      <div className="bg-surface-elevated rounded-xl overflow-hidden opacity-60 cursor-not-allowed">
        <div className={`h-28 bg-gradient-to-br ${gradient} flex items-center justify-center relative`}>
          <Icon className="w-8 h-8 text-white/40" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Lock className="w-6 h-6 text-white/70" />
          </div>
        </div>
        <div className="p-3">
          <h3 className="text-sm font-medium text-gray-500 line-clamp-2">{course.title}</h3>
          <p className="text-xs text-gray-600 mt-1">プランアップグレードで利用可能</p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/courses/${courseSlug}`}
      className="bg-surface-elevated rounded-xl overflow-hidden hover:ring-2 hover:ring-brand transition-all group"
    >
      <div className={`h-28 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <Icon className="w-8 h-8 text-white/50 group-hover:text-white/70 transition-colors" />
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium text-white group-hover:text-brand-light transition-colors line-clamp-2">
          {course.title}
        </h3>
        {course.total_lessons > 0 && (
          <p className="text-xs text-gray-500 mt-1">{course.total_lessons}レッスン</p>
        )}
      </div>
    </Link>
  );
}
