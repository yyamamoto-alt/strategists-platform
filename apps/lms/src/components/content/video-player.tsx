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

export function VideoPlayer({
  src,
  watermarkText,
  protected: isProtected = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <CopyProtectedWrapper enabled={isProtected}>
      <div className="relative rounded-lg overflow-hidden bg-black">
        {isYouTubeUrl(src) ? (
          <div className="aspect-video">
            <iframe
              src={getYouTubeEmbedUrl(src)}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
