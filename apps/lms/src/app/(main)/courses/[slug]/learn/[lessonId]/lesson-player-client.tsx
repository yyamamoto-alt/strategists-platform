"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { VideoPlayer } from "@/components/content/video-player";
import { MultiVideoPlayer } from "@/components/content/multi-video-player";
import { MarkdownViewer } from "@/components/content/markdown-viewer";
import { RichContentViewer } from "@/components/content/rich-content-viewer";
import { TableOfContents } from "@/components/content/table-of-contents";
import LessonNotes from "@/components/content/lesson-notes";
import { TextToSpeech } from "@/components/content/text-to-speech";
import { extractTocFromMarkdown, extractTocFromHtml } from "@/lib/toc-utils";
import { useDisplaySettings, getFontSizeClass } from "@/lib/display-settings";
import { ArrowLeft, ArrowRight, CheckCircle, Circle, Eye, Video, FileText, BookOpen, Users, ExternalLink, Minus, Plus, Sun, Moon } from "lucide-react";
import type { Lesson } from "@/types/database";

const DWELL_TIME_THRESHOLD = 5 * 60 * 1000; // 5分

interface Props {
  slug: string;
  lessonId: string;
  allLessons: Lesson[];
  progressMap: Record<string, string>;
  customerId: string | null;
}

function useProgressTracker(lessonId: string, customerId: string | null, initialStatus: string | undefined) {
  const [status, setStatus] = useState<string>(initialStatus || "未着手");
  const startTimeRef = useRef<number>(Date.now());
  const trackedRef = useRef(false);
  const activeTimeRef = useRef(0);
  const lastActiveRef = useRef(Date.now());

  const updateProgress = useCallback(async (newStatus: string) => {
    if (!customerId) return;
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId, status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.unchanged) {
          setStatus(data.status);
        }
      }
    } catch (e) {
      console.error("Progress update failed:", e);
    }
  }, [lessonId, customerId]);

  useEffect(() => {
    if (!customerId) return;
    if (!initialStatus || initialStatus === "未着手") {
      updateProgress("進行中");
    }
  }, [lessonId, customerId, initialStatus, updateProgress]);

  useEffect(() => {
    if (!customerId) return;
    trackedRef.current = false;
    startTimeRef.current = Date.now();
    activeTimeRef.current = 0;
    lastActiveRef.current = Date.now();

    const handleActivity = () => { lastActiveRef.current = Date.now(); };
    const checkDwellTime = () => {
      if (trackedRef.current) return;
      const now = Date.now();
      if (now - lastActiveRef.current < 30000) activeTimeRef.current += 1000;
      if (activeTimeRef.current >= DWELL_TIME_THRESHOLD) {
        trackedRef.current = true;
        updateProgress("閲覧済み");
      }
    };

    const interval = setInterval(checkDwellTime, 1000);
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("scroll", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("click", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [lessonId, customerId, updateProgress]);

  const markComplete = useCallback(() => { updateProgress("完了"); }, [updateProgress]);
  return { status, markComplete };
}

export function LessonPlayerClient({ slug, lessonId, allLessons, progressMap, customerId }: Props) {
  const [localProgressMap, setLocalProgressMap] = useState<Record<string, string>>(progressMap);
  const contentRef = useRef<HTMLDivElement>(null);
  const { fontSize, theme, setFontSize, setTheme } = useDisplaySettings();

  const lesson = allLessons.find((l) => l.id === lessonId);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  const { status, markComplete } = useProgressTracker(lessonId, customerId, localProgressMap[lessonId]);

  useEffect(() => {
    setLocalProgressMap((prev) => ({ ...prev, [lessonId]: status }));
  }, [status, lessonId]);

  useEffect(() => {
    setLocalProgressMap(progressMap);
  }, [progressMap]);

  const totalLessons = allLessons.length;
  const completedCount = allLessons.filter(
    (l) => localProgressMap[l.id] === "完了" || localProgressMap[l.id] === "閲覧済み"
  ).length;
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // TOC extraction
  const tocItems = useMemo(() => {
    if (!lesson?.markdown_content) return [];
    const isHtml = (lesson as any).content_format === "html";
    return isHtml
      ? extractTocFromHtml(lesson.markdown_content)
      : extractTocFromMarkdown(lesson.markdown_content);
  }, [lesson]);

  const proseClass = getFontSizeClass(fontSize);

  const cycleFontSize = () => {
    const sizes: Array<"sm" | "md" | "lg"> = ["sm", "md", "lg"];
    const idx = sizes.indexOf(fontSize);
    setFontSize(sizes[(idx + 1) % sizes.length]);
  };

  if (!lesson) {
    return (
      <div className="p-6 bg-surface min-h-screen text-center py-20">
        <p className="text-gray-400 mb-4">レッスンが見つかりません</p>
        <Link href={`/courses/${slug}`} className="text-brand-light hover:underline text-sm">コースに戻る</Link>
      </div>
    );
  }

  const isCompleted = status === "完了";

  return (
    <div className="flex h-screen bg-surface">
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface-card border-b border-white/10">
          <div className="px-6 py-3 flex items-center justify-between">
            <Link href={`/courses/${slug}`} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" />コースに戻る
            </Link>
            <div className="flex items-center gap-3">
              {/* Display settings */}
              <div className="flex items-center gap-1 border border-white/10 rounded-lg px-2 py-1">
                <button
                  onClick={cycleFontSize}
                  className="text-xs text-gray-400 hover:text-white transition-colors px-1"
                  title="フォントサイズ変更"
                >
                  A<span className="text-[10px]">/{fontSize.toUpperCase()}</span>
                </button>
                <div className="w-px h-4 bg-white/10" />
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="text-gray-400 hover:text-white transition-colors p-0.5"
                  title={theme === "dark" ? "ライトモード" : "ダークモード"}
                >
                  {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
              </div>
              {/* TTS */}
              <TextToSpeech contentRef={contentRef} />
              <span className="text-sm text-gray-400">{currentIndex + 1} / {allLessons.length}</span>
              <span className="text-xs text-gray-500">{progressPercent}% 完了</span>
            </div>
          </div>
          <div className="h-1 bg-white/5">
            <div className="h-full bg-brand transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <div className="p-6 max-w-4xl mx-auto" ref={contentRef}>
          <h1 className="text-2xl font-bold text-white mb-6 pb-3 border-b-2 border-[#DC2626]/30">{lesson.title}</h1>
          {(lesson as any).video_urls?.length > 0 ? (
            <div className="mb-6">
              <MultiVideoPlayer videos={(lesson as any).video_urls} copyProtected={lesson.copy_protected} />
            </div>
          ) : lesson.video_url && lesson.markdown_content && lesson.lesson_type === "動画" ? (
            <div className="mb-6">
              <MultiVideoPlayer mainVideoUrl={lesson.video_url} htmlContent={lesson.markdown_content} copyProtected={lesson.copy_protected} />
            </div>
          ) : (
            <>
              {lesson.video_url && (
                <div className="mb-6"><VideoPlayer src={lesson.video_url} protected={lesson.copy_protected} /></div>
              )}
              {lesson.markdown_content && (
                <div className="mb-6">
                  {(lesson as any).content_format === "html" ? (
                    <RichContentViewer content={lesson.markdown_content} protected={lesson.copy_protected} proseClass={proseClass} />
                  ) : (
                    <MarkdownViewer content={lesson.markdown_content} protected={lesson.copy_protected} proseClass={proseClass} />
                  )}
                </div>
              )}
            </>
          )}
          {lesson.content_url && (
            <div className="mb-6">
              <a href={lesson.content_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-surface-elevated hover:bg-white/10 text-brand-light hover:text-white px-5 py-3 rounded-lg transition-colors border border-white/10">
                <ExternalLink className="w-5 h-5" />教材を開く（外部サイト）
              </a>
            </div>
          )}
          {lesson.description && (
            <div className="bg-surface-elevated rounded-lg p-6 mb-6"><p className="text-gray-300 whitespace-pre-wrap">{lesson.description}</p></div>
          )}
          <div className="flex items-center justify-between mb-6">
            <button onClick={markComplete} disabled={isCompleted} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${isCompleted ? "bg-green-900/50 text-green-300 cursor-default" : "bg-brand hover:bg-brand-dark text-white"}`}>
              <CheckCircle className="w-5 h-5" />{isCompleted ? "完了済み" : "完了にする"}
            </button>
            {status === "閲覧済み" && (
              <span className="flex items-center gap-1.5 text-sm text-blue-400"><Eye className="w-4 h-4" />閲覧済み</span>
            )}
            {status === "進行中" && (
              <span className="flex items-center gap-1.5 text-sm text-yellow-400"><Circle className="w-4 h-4" />閲覧中...</span>
            )}
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
      {/* Right sidebar: TOC */}
      {tocItems.length > 0 && (
        <aside className="w-72 bg-surface-card border-l border-white/10 overflow-y-auto hidden lg:block">
          <div className="p-4 sticky top-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase">目次</h3>
              <span className="text-xs text-gray-500">{progressPercent}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full mb-3">
              <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>
            <TableOfContents items={tocItems} />
          </div>
        </aside>
      )}
      {/* Notes floating button */}
      <LessonNotes lessonId={lessonId} />
    </div>
  );
}
