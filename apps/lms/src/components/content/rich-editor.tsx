"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import YoutubeExtension from "@tiptap/extension-youtube";
import PlaceholderExtension from "@tiptap/extension-placeholder";
import LinkExtension from "@tiptap/extension-link";
import UnderlineExtension from "@tiptap/extension-underline";
import { Bold, Italic, Underline, Link, Strikethrough } from "lucide-react";
import { EditorToolbar } from "./editor-toolbar";
import { useEffect, useRef } from "react";

interface RichEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichEditor({ content, onChange, placeholder = "コンテンツを入力..." }: RichEditorProps) {
  const isInitialMount = useRef(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      ImageExtension.configure({
        HTMLAttributes: { class: "rounded-lg border border-white/10 max-w-full" },
      }),
      YoutubeExtension.configure({
        width: 640,
        height: 360,
        HTMLAttributes: { class: "rounded-lg overflow-hidden" },
      }),
      PlaceholderExtension.configure({ placeholder }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-brand-light underline", target: "_blank", rel: "noopener noreferrer" },
      }),
      UnderlineExtension,
    ],
    content,
    editorProps: {
      attributes: {
        class: [
          "prose prose-invert prose-sm sm:prose-base max-w-none",
          "min-h-[300px] px-4 py-3 focus:outline-none",
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
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

  // content prop が外部から変わった場合にエディタを更新
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-surface">
      <EditorToolbar editor={editor} />
      {editor && (
        <BubbleMenu editor={editor} className="flex items-center gap-0.5 bg-surface-elevated border border-white/10 rounded-lg p-1 shadow-xl">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded ${editor.isActive("bold") ? "bg-brand/30 text-brand-light" : "text-gray-400 hover:text-white"}`}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded ${editor.isActive("italic") ? "bg-brand/30 text-brand-light" : "text-gray-400 hover:text-white"}`}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded ${editor.isActive("underline") ? "bg-brand/30 text-brand-light" : "text-gray-400 hover:text-white"}`}
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded ${editor.isActive("strike") ? "bg-brand/30 text-brand-light" : "text-gray-400 hover:text-white"}`}
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const url = prompt("リンクURL:");
              if (url) editor.chain().focus().setLink({ href: url, target: "_blank" }).run();
            }}
            className={`p-1.5 rounded ${editor.isActive("link") ? "bg-brand/30 text-brand-light" : "text-gray-400 hover:text-white"}`}
          >
            <Link className="w-3.5 h-3.5" />
          </button>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
