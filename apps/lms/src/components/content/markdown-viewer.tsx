"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { CopyProtectedWrapper } from "./copy-protected-wrapper";
import { getYouTubeEmbedUrl, isYouTubeUrl } from "@/lib/content-utils";

interface Props {
  content: string;
  protected?: boolean;
}

export function MarkdownViewer({
  content,
  protected: isProtected = true,
}: Props) {
  return (
    <CopyProtectedWrapper enabled={isProtected}>
      <div className="prose prose-invert prose-base max-w-none
        prose-headings:text-white prose-headings:font-bold
        prose-h1:text-2xl prose-h1:border-b-2 prose-h1:border-[#DC2626]/30 prose-h1:pb-3 prose-h1:mb-6
        prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-white/10
        prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3 prose-h3:pl-3 prose-h3:border-l-[3px] prose-h3:border-[#DC2626]
        prose-p:text-gray-300 prose-p:leading-[1.9] prose-p:mb-5
        prose-strong:text-[#F5F3F0]
        prose-a:text-[#DC2626] prose-a:no-underline hover:prose-a:underline
        prose-blockquote:border-l-[3px] prose-blockquote:border-[#DC2626] prose-blockquote:bg-[#1a1a1f] prose-blockquote:rounded-r-lg prose-blockquote:py-3 prose-blockquote:px-5 prose-blockquote:text-gray-300 prose-blockquote:not-italic
        prose-code:text-[#DC2626] prose-code:bg-white/[0.06] prose-code:rounded prose-code:px-1.5 prose-code:py-0.5
        prose-pre:bg-[#111115] prose-pre:border prose-pre:border-white/10 prose-pre:rounded-lg
        prose-img:rounded-lg prose-img:border prose-img:border-white/10
        prose-li:text-gray-300 prose-li:leading-[1.8] prose-li:marker:text-[#DC2626]
        prose-hr:border-[#DC2626]/15
        prose-table:border-collapse
        prose-th:border prose-th:border-white/10 prose-th:bg-white/[0.05] prose-th:px-3 prose-th:py-2 prose-th:text-left
        prose-td:border prose-td:border-white/10 prose-td:px-3 prose-td:py-2
      ">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            p: ({ children, ...props }) => {
              // YouTube URL を自動的に埋め込みに変換
              if (
                typeof children === "string" &&
                children.trim().match(/^https?:\/\//) &&
                isYouTubeUrl(children.trim())
              ) {
                return (
                  <div className="aspect-video rounded-lg overflow-hidden my-4">
                    <iframe
                      src={getYouTubeEmbedUrl(children.trim())}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                );
              }
              return <p {...props}>{children}</p>;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </CopyProtectedWrapper>
  );
}
