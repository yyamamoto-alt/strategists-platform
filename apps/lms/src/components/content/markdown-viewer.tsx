"use client";
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
      <div
        className="prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </CopyProtectedWrapper>
  );
}
