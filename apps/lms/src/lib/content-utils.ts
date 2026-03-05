/**
 * コンテンツ関連のユーティリティ
 * video-player.tsx から URL 解析ロジックを共通化
 */

export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}

export function getYouTubeEmbedUrl(url: string): string {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?#]+)/
  );
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

export function getYouTubeVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?#]+)/
  );
  return match ? match[1] : null;
}

export function isGoogleDriveUrl(url: string): boolean {
  return /drive\.google\.com/.test(url);
}

export function getGoogleDriveEmbedUrl(url: string): string {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  return match
    ? `https://drive.google.com/file/d/${match[1]}/preview`
    : url;
}

export type VideoType = "youtube" | "gdrive" | "native";

export function detectVideoType(url: string): VideoType {
  if (isYouTubeUrl(url)) return "youtube";
  if (isGoogleDriveUrl(url)) return "gdrive";
  return "native";
}

/** Notionマークダウンクリーンアップ */
export function cleanNotionMarkdown(md: string): string {
  let cleaned = md;
  cleaned = cleaned.replace(/\[([^\]]+)\]\(\)/g, "$1");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/^(.*\n)+?(?=# )/m, "");
  cleaned = cleaned.replace(/> [^\w\s<>&]{1,3}\s*/g, "> ");
  return cleaned.trim();
}
