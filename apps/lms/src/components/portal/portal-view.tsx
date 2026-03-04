"use client";

import { SectionHeader } from "./section-header";
import { ContentCard } from "./content-card";
import { ExternalLink, BookOpen } from "lucide-react";
import type { Course } from "@/types/database";

interface PortalViewProps {
  courses: Course[];
  lockedCourses?: Course[];  // プラン外でロック表示するコース
}

// カテゴリ別にグルーピング
function groupByCategory(courses: Course[]): Record<string, Course[]> {
  const groups: Record<string, Course[]> = {};
  for (const course of courses) {
    const cat = course.category || "その他";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(course);
  }
  return groups;
}

// セクション表示順とアイコン
const sectionConfig: { category: string; icon: string; title: string }[] = [
  { category: "教科書", icon: "📚", title: "教科書" },
  { category: "動画講座", icon: "🎬", title: "動画講座" },
  { category: "補助教材", icon: "📎", title: "補助教材" },
];

// 外部フォームリンク
const formLinks = [
  { title: "教材アウトプットフォーム", url: "" },
  { title: "自己振り返りフォーム", url: "" },
  { title: "添削提出フォーム", url: "" },
  { title: "面接振り返りフォーム", url: "" },
];

export function PortalView({ courses, lockedCourses = [] }: PortalViewProps) {
  const grouped = groupByCategory(courses);
  const lockedGrouped = groupByCategory(lockedCourses);

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">学習ポータル</h1>
        <p className="text-sm text-gray-400 mt-1">教材や動画講座にアクセスできます</p>
      </div>

      {/* 推奨学習方法 */}
      <div className="bg-surface-elevated rounded-xl p-5 mb-8 border border-white/10">
        <SectionHeader icon="📖" title="推奨学習方法" />
        <p className="text-sm text-gray-300 leading-relaxed">
          まずは教科書を一通り読み、動画講座で理解を深めてください。
          メンタリングセッションで実践的なフィードバックを受けることで、効率的に学習を進められます。
        </p>
      </div>

      {/* 教科書・動画講座・補助教材 */}
      {sectionConfig.map(({ category, icon, title }) => {
        const categoryCourses = grouped[category] || [];
        const categoryLocked = lockedGrouped[category] || [];
        if (categoryCourses.length === 0 && categoryLocked.length === 0) return null;

        return (
          <div key={category} className="mb-8">
            <SectionHeader icon={icon} title={title} />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {categoryCourses.map((course) => (
                <ContentCard key={course.id} course={course} />
              ))}
              {categoryLocked.map((course) => (
                <ContentCard key={course.id} course={course} locked />
              ))}
            </div>
          </div>
        );
      })}

      {/* カテゴリ未分類コース */}
      {Object.entries(grouped)
        .filter(([cat]) => !sectionConfig.some((s) => s.category === cat))
        .map(([cat, catCourses]) => (
          <div key={cat} className="mb-8">
            <SectionHeader icon="📁" title={cat} />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {catCourses.map((course) => (
                <ContentCard key={course.id} course={course} />
              ))}
            </div>
          </div>
        ))}

      {/* 各種フォーム */}
      {formLinks.some((f) => f.url) && (
        <div className="mb-8">
          <SectionHeader icon="📝" title="各種フォーム" />
          <div className="space-y-2">
            {formLinks.map((form) =>
              form.url ? (
                <a
                  key={form.title}
                  href={form.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-gray-300 hover:text-brand-light transition-colors px-3 py-2 rounded-lg hover:bg-white/[0.03]"
                >
                  <ExternalLink className="w-4 h-4 text-gray-500" />
                  {form.title}
                </a>
              ) : (
                <div
                  key={form.title}
                  className="flex items-center gap-2 text-sm text-gray-500 px-3 py-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  {form.title}（準備中）
                </div>
              )
            )}
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
