"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyProtectedWrapper } from "./copy-protected-wrapper";

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
      <div className="prose prose-invert prose-sm sm:prose-base max-w-none
        prose-headings:text-white prose-headings:font-bold
        prose-h1:text-2xl prose-h1:border-b prose-h1:border-white/10 prose-h1:pb-2 prose-h1:mb-4
        prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3
        prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2
        prose-p:text-gray-300 prose-p:leading-relaxed
        prose-strong:text-white
        prose-a:text-brand-light prose-a:no-underline hover:prose-a:underline
        prose-blockquote:border-l-brand prose-blockquote:bg-white/[0.03] prose-blockquote:rounded-r-lg prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:text-gray-300
        prose-code:text-brand-light prose-code:bg-white/[0.08] prose-code:rounded prose-code:px-1.5 prose-code:py-0.5
        prose-pre:bg-[#1a1a2e] prose-pre:border prose-pre:border-white/10
        prose-img:rounded-lg prose-img:border prose-img:border-white/10
        prose-li:text-gray-300
        prose-hr:border-white/10
        prose-table:border-collapse
        prose-th:border prose-th:border-white/10 prose-th:bg-white/[0.05] prose-th:px-3 prose-th:py-2 prose-th:text-left
        prose-td:border prose-td:border-white/10 prose-td:px-3 prose-td:py-2
      ">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </CopyProtectedWrapper>
  );
}
