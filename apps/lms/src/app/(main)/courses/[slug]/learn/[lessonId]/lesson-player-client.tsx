"use client";

import Link from "next/link";
import { useState } from "react";
import { VideoPlayer } from "@/components/content/video-player";
import { MarkdownViewer } from "@/components/content/markdown-viewer";
import { RichContentViewer } from "@/components/content/rich-content-viewer";
import { ArrowLeft, ArrowRight, CheckCircle, Circle, Video, FileText, BookOpen, Users, ExternalLink } from "lucide-react";
import type { Lesson } from "@/types/database";

const typeIcons: Record<string, typeof Video> = {
  "動画": Video, "テキスト": FileText, "ケース演習": BookOpen, "模擬面接": Users, "課題": FileText,
};

interface Props {
  slug: string;
  lessonId: string;
  allLessons: Lesson[];
}

export function LessonPlayerClient({ slug, lessonId, allLessons }: Props) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const lesson = allLessons.find((l) => l.id === lessonId);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  const handleMarkComplete = () => {
    setCompletedIds((prev) => new Set(prev).add(lessonId));
  };

  if (!lesson) {
    return (
      <div className="p-6 bg-surface min-h-screen text-center py-20">
        <p className="text-gray-400 mb-4">レッスンが見つかりません</p>
        <Link href={`/courses/${slug}`} className="text-brand-light hover:underline text-sm">
          コースに戻る
        </Link>
      </div>
    );
  }

  const isCompleted = completedIds.has(lessonId);

  return (
    <div className="flex h-screen bg-surface">
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface-card border-b border-white/10 px-6 py-3 flex items-center justify-between">
          <Link href={`/courses/${slug}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />コースに戻る
          </Link>
          <div className="text-sm text-gray-400">{currentIndex + 1} / {allLessons.length}</div>
        </div>
        <div className="p-6 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">{lesson.title}</h1>
          {lesson.video_url && (
            <div className="mb-6"><VideoPlayer src={lesson.video_url} protected={lesson.copy_protected} /></div>
          )}
          {lesson.markdown_content && (
            <div className="mb-6">
              {(lesson as any).content_format === "html" ? (
                <RichContentViewer content={lesson.markdown_content} protected={lesson.copy_protected} />
              ) : (
                <MarkdownViewer content={lesson.markdown_content} protected={lesson.copy_protected} />
              )}
            </div>
          )}
          {/* 外部リンク教材（note.com等） */}
          {lesson.content_url && (
            <div className="mb-6">
              <a
                href={lesson.content_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-surface-elevated hover:bg-white/10 text-brand-light hover:text-white px-5 py-3 rounded-lg transition-colors border border-white/10"
              >
                <ExternalLink className="w-5 h-5" />
                教材を開く（外部サイト）
              </a>
            </div>
          )}
          {lesson.description && (
            <div className="bg-surface-elevated rounded-lg p-6 mb-6"><p className="text-gray-300 whitespace-pre-wrap">{lesson.description}</p></div>
          )}
          <div className="flex items-center justify-between mb-6">
            <button onClick={handleMarkComplete} disabled={isCompleted} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${isCompleted ? "bg-green-900/50 text-green-300 cursor-default" : "bg-brand hover:bg-brand-dark text-white"}`}>
              <CheckCircle className="w-5 h-5" />{isCompleted ? "完了済み" : "完了にする"}
            </button>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-6">
            {prevLesson ? (
              <Link href={`/courses/${slug}/learn/${prevLesson.id}`} className="flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-3 py-2 rounded-lg transition-colors">
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <div className="text-left">
                  <span className="text-xs text-gray-500 block">前のレッスン</span>
                  <span className="text-sm truncate max-w-[200px] block">{prevLesson.title}</span>
                </div>
              </Link>
            ) : <div />}
            {nextLesson ? (
              <Link href={`/courses/${slug}/learn/${nextLesson.id}`} className="flex items-center gap-2 text-gray-400 hover:text-white hover:bg-white/5 px-3 py-2 rounded-lg transition-colors">
                <div className="text-right">
                  <span className="text-xs text-gray-500 block">次のレッスン</span>
                  <span className="text-sm truncate max-w-[200px] block">{nextLesson.title}</span>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Link>
            ) : <div />}
          </div>
        </div>
      </div>
      <aside className="w-72 bg-surface-card border-l border-white/10 overflow-y-auto hidden lg:block">
        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">レッスン一覧</h3>
          <div className="space-y-1">
            {allLessons.map((l) => {
              const Icon = typeIcons[l.lesson_type] || FileText;
              const isCurrent = l.id === lessonId;
              const done = completedIds.has(l.id);
              return (
                <Link key={l.id} href={`/courses/${slug}/learn/${l.id}`} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isCurrent ? "bg-brand-muted text-brand-light" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}>
                  {done ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" /> : <Circle className="w-4 h-4 text-gray-600 shrink-0" />}
                  <span className="truncate">{l.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
