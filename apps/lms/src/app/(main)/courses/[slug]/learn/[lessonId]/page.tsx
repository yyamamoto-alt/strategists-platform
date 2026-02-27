"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { mockModules } from "@/lib/mock-data";
import { VideoPlayer } from "@/components/content/video-player";
import { MarkdownViewer } from "@/components/content/markdown-viewer";
import { ArrowLeft, ArrowRight, CheckCircle, Circle, Video, FileText, BookOpen, Users } from "lucide-react";

const typeIcons: Record<string, typeof Video> = {
  "動画": Video, "テキスト": FileText, "ケース演習": BookOpen, "模擬面接": Users, "課題": FileText,
};

export default function LessonPlayerPage() {
  const params = useParams();
  const slug = params.slug as string;
  const lessonId = params.lessonId as string;
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const allLessons = mockModules.flatMap((m) => m.lessons || []);
  const lesson = allLessons.find((l) => l.id === lessonId);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  const handleMarkComplete = () => {
    setCompletedIds((prev) => new Set(prev).add(lessonId));
  };

  if (!lesson) {
    return (
      <div className="p-6 bg-gray-950 min-h-screen text-center py-20">
        <p className="text-gray-400">レッスンが見つかりません</p>
      </div>
    );
  }

  const isCompleted = completedIds.has(lessonId);

  return (
    <div className="flex h-screen bg-gray-950">
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
          <Link href={`/courses/${slug}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />コースに戻る
          </Link>
          <div className="text-sm text-gray-400">{currentIndex + 1} / {allLessons.length}</div>
        </div>
        <div className="p-6 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">{lesson.title}</h1>
          {lesson.lesson_type === "動画" && lesson.video_url && (
            <div className="mb-6"><VideoPlayer src={lesson.video_url} protected={lesson.copy_protected} /></div>
          )}
          {lesson.lesson_type === "テキスト" && lesson.markdown_content && (
            <div className="mb-6"><MarkdownViewer content={lesson.markdown_content} protected={lesson.copy_protected} /></div>
          )}
          {lesson.description && (
            <div className="bg-gray-800 rounded-lg p-6 mb-6"><p className="text-gray-300 whitespace-pre-wrap">{lesson.description}</p></div>
          )}
          <div className="flex items-center justify-between mb-6">
            <button onClick={handleMarkComplete} disabled={isCompleted} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${isCompleted ? "bg-green-900/50 text-green-300 cursor-default" : "bg-primary-600 hover:bg-primary-700 text-white"}`}>
              <CheckCircle className="w-5 h-5" />{isCompleted ? "完了済み" : "完了にする"}
            </button>
          </div>
          <div className="flex justify-between border-t border-gray-700 pt-6">
            {prevLesson ? <Link href={`/courses/${slug}/learn/${prevLesson.id}`} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /><span className="text-sm">{prevLesson.title}</span></Link> : <div />}
            {nextLesson ? <Link href={`/courses/${slug}/learn/${nextLesson.id}`} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"><span className="text-sm">{nextLesson.title}</span><ArrowRight className="w-4 h-4" /></Link> : <div />}
          </div>
        </div>
      </div>
      <aside className="w-72 bg-gray-900 border-l border-gray-700 overflow-y-auto hidden lg:block">
        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">レッスン一覧</h3>
          <div className="space-y-1">
            {allLessons.map((l) => {
              const Icon = typeIcons[l.lesson_type] || FileText;
              const isCurrent = l.id === lessonId;
              const done = completedIds.has(l.id);
              return (
                <Link key={l.id} href={`/courses/${slug}/learn/${l.id}`} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isCurrent ? "bg-primary-600/20 text-primary-400" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}>
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
