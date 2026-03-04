"use client";
import { useRef } from "react";
import { CopyProtectedWrapper } from "./copy-protected-wrapper";

interface Props {
  src: string;
  watermarkText?: string;
  protected?: boolean;
}

function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}

function getYouTubeEmbedUrl(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?#]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

function isGoogleDriveUrl(url: string): boolean {
  return /drive\.google\.com/.test(url);
}

function getGoogleDriveEmbedUrl(url: string): string {
  // drive.google.com/file/d/XXX/view → drive.google.com/file/d/XXX/preview
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  return match ? `https://drive.google.com/file/d/${match[1]}/preview` : url;
}

type VideoType = "youtube" | "gdrive" | "native";

function detectVideoType(url: string): VideoType {
  if (isYouTubeUrl(url)) return "youtube";
  if (isGoogleDriveUrl(url)) return "gdrive";
  return "native";
}

export function VideoPlayer({
  src,
  watermarkText,
  protected: isProtected = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoType = detectVideoType(src);

  return (
    <CopyProtectedWrapper enabled={isProtected}>
      <div className="relative rounded-lg overflow-hidden bg-black">
        {videoType === "youtube" ? (
          <div className="aspect-video">
            <iframe
              src={getYouTubeEmbedUrl(src)}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : videoType === "gdrive" ? (
          <div className="aspect-video">
            <iframe
              src={getGoogleDriveEmbedUrl(src)}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            src={src}
            controls
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            className="w-full"
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
        {watermarkText && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10 text-white text-4xl font-bold rotate-[-30deg]">
            {watermarkText}
          </div>
        )}
      </div>
    </CopyProtectedWrapper>
  );
}
