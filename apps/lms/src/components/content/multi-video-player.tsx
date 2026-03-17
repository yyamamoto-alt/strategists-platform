"use client";

import { useState, useMemo } from "react";
import { VideoPlayer } from "./video-player";
import { ChevronLeft, ChevronRight, Play, CheckCircle } from "lucide-react";

interface LessonVideo {
  title: string;
  url: string;
  duration_minutes?: number;
  description?: string;
}

interface VideoSection {
  title: string;
  description: string;
  videoUrl: string;
}

interface Props {
  videos?: LessonVideo[];
  mainVideoUrl?: string;
  htmlContent?: string;
  copyProtected?: boolean;
}

function parseVideoSections(mainVideoUrl: string, html: string): VideoSection[] {
  const sections: VideoSection[] = [];

  // Split by ◼ or ◼︎ markers for sections
  const sectionRegex = /[◼◼︎]\s*(?:︎\s*)?(.+?)(?=<\/p>)/g;
  const linkRegex = /href="([^"]+(?:drive\.google\.com|youtube\.com|youtu\.be)[^"]*)"/g;

  // Parse HTML into DOM-like structure using regex
  // Split content by video links to identify sections
  const parts = html.split(/(<p>[^<]*[◼◼︎])/);

  // Simpler approach: find all video URLs and their preceding section titles
  const allUrls: string[] = [];
  const allTitles: string[] = [];
  const allDescs: string[] = [];

  // Extract sections with their video URLs
  const lines = html.split(/<\/p>\s*<p>|<\/p>|<p>/);

  let currentTitle = "";
  let currentDesc = "";

  for (const line of lines) {
    const cleanLine = line.replace(/<[^>]+>/g, "").trim();
    if (!cleanLine) continue;

    // Check if this line is a section title (starts with ◼)
    if (/^[◼]/.test(cleanLine)) {
      if (currentTitle && allTitles.length > allUrls.length) {
        // Previous section had no video, skip
      }
      currentTitle = cleanLine.replace(/^[◼︎]+\s*/, "").trim();
      currentDesc = "";
      allTitles.push(currentTitle);
      allDescs.push("");
      continue;
    }

    // Check if this line has a video link
    const urlMatch = line.match(/href="([^"]+(?:drive\.google\.com|youtube\.com|youtu\.be)[^"]*)"/);
    if (urlMatch) {
      allUrls.push(urlMatch[1]);
      continue;
    }

    // Otherwise it's description text for the current section
    if (allDescs.length > 0 && cleanLine && !cleanLine.startsWith("🎦")) {
      const idx = allDescs.length - 1;
      allDescs[idx] = allDescs[idx] ? allDescs[idx] + "\n" + cleanLine : cleanLine;
    }
  }

  // Match titles with URLs
  let urlIdx = 0;
  for (let i = 0; i < allTitles.length; i++) {
    if (urlIdx < allUrls.length) {
      sections.push({
        title: allTitles[i],
        description: allDescs[i] || "",
        videoUrl: allUrls[urlIdx],
      });
      urlIdx++;
    }
  }

  // If no sections parsed, fall back to single video
  if (sections.length === 0 && mainVideoUrl) {
    sections.push({
      title: "動画",
      description: "",
      videoUrl: mainVideoUrl,
    });
  }

  return sections;
}

export function MultiVideoPlayer({ videos, mainVideoUrl, htmlContent, copyProtected }: Props) {
  const sections = useMemo(() => {
    // 構造化データがあればそちらを優先
    if (videos && videos.length > 0) {
      return videos.map((v) => ({
        title: v.title,
        description: v.description || "",
        videoUrl: v.url,
      }));
    }
    // レガシー: HTMLパース
    if (mainVideoUrl && htmlContent) {
      return parseVideoSections(mainVideoUrl, htmlContent);
    }
    // フォールバック: 単一動画
    if (mainVideoUrl) {
      return [{ title: "動画", description: "", videoUrl: mainVideoUrl }];
    }
    return [];
  }, [videos, mainVideoUrl, htmlContent]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [watchedSet, setWatchedSet] = useState<Set<number>>(() => new Set());

  // If only 1 video, just render the simple player
  if (sections.length <= 1 && sections[0]?.videoUrl) {
    return <VideoPlayer src={sections[0].videoUrl} protected={copyProtected} />;
  }
  if (sections.length === 0) return null;

  const current = sections[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < sections.length - 1;

  const markWatched = (idx: number) => {
    setWatchedSet((prev) => new Set(prev).add(idx));
  };

  const goTo = (idx: number) => {
    markWatched(currentIndex);
    setCurrentIndex(idx);
  };

  return (
    <div className="space-y-4">
      {/* Video Player */}
      <VideoPlayer src={current.videoUrl} protected={copyProtected} />

      {/* Current video info */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{current.title}</h3>
          {current.description && (
            <p className="text-sm text-gray-400 mt-1 whitespace-pre-line">{current.description}</p>
          )}
        </div>
        <span className="text-sm text-gray-500 shrink-0 ml-4">
          {currentIndex + 1} / {sections.length}
        </span>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => goTo(currentIndex - 1)}
          disabled={!hasPrev}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-white/5 hover:bg-white/10 text-gray-300"
        >
          <ChevronLeft className="w-4 h-4" />
          前の動画
        </button>
        <button
          onClick={() => goTo(currentIndex + 1)}
          disabled={!hasNext}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-brand hover:bg-brand-dark text-white"
        >
          次の動画
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Playlist */}
      <div className="bg-surface-elevated rounded-lg border border-white/10 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/10">
          <span className="text-xs font-semibold text-gray-400 uppercase">動画一覧</span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {sections.map((section, idx) => {
            const isCurrent = idx === currentIndex;
            const isWatched = watchedSet.has(idx);
            return (
              <button
                key={idx}
                onClick={() => goTo(idx)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  isCurrent
                    ? "bg-brand/10 text-brand-light"
                    : "text-gray-400 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span className="shrink-0 w-6 h-6 flex items-center justify-center">
                  {isWatched ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : isCurrent ? (
                    <Play className="w-4 h-4 text-brand-light" />
                  ) : (
                    <span className="text-xs text-gray-500">{idx + 1}</span>
                  )}
                </span>
                <span className="text-sm truncate">{section.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
