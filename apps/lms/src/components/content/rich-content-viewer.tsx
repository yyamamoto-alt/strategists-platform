"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import YoutubeExtension from "@tiptap/extension-youtube";
import LinkExtension from "@tiptap/extension-link";
import UnderlineExtension from "@tiptap/extension-underline";
import { CopyProtectedWrapper } from "./copy-protected-wrapper";

interface Props {
  content: string;
  protected?: boolean;
}

export function RichContentViewer({ content, protected: isProtected = true }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      ImageExtension,
      YoutubeExtension.configure({ width: 640, height: 360 }),
      LinkExtension.configure({
        openOnClick: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      UnderlineExtension,
    ],
    content,
    editable: false,
    editorProps: {
      attributes: {
        class: [
          "prose prose-invert prose-sm sm:prose-base max-w-none",
          "prose-headings:text-white prose-headings:font-bold",
          "prose-h1:text-2xl prose-h1:border-b prose-h1:border-white/10 prose-h1:pb-2 prose-h1:mb-4",
          "prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3",
          "prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2",
          "prose-p:text-gray-300 prose-p:leading-relaxed",
          "prose-strong:text-white",
          "prose-a:text-brand-light prose-a:no-underline hover:prose-a:underline",
          "prose-blockquote:border-l-brand prose-blockquote:bg-white/[0.03] prose-blockquote:rounded-r-lg prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:text-gray-300",
          "prose-code:text-brand-light prose-code:bg-white/[0.08] prose-code:rounded prose-code:px-1.5 prose-code:py-0.5",
          "prose-pre:bg-[#1a1a2e] prose-pre:border prose-pre:border-white/10",
          "prose-img:rounded-lg prose-img:border prose-img:border-white/10",
          "prose-li:text-gray-300",
          "prose-hr:border-white/10",
        ].join(" "),
      },
    },
  });

  if (!editor) return null;

  return (
    <CopyProtectedWrapper enabled={isProtected}>
      <EditorContent editor={editor} />
    </CopyProtectedWrapper>
  );
}
