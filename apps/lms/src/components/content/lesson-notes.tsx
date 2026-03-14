"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { StickyNote, X } from "lucide-react";

interface LessonNotesProps {
  lessonId: string;
}

type SaveStatus = "" | "保存中..." | "保存済み";

export default function LessonNotes({ lessonId }: LessonNotesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("");
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  // 既存メモを取得
  useEffect(() => {
    isMounted.current = true;
    const fetchNote = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/notes?lesson_id=${lessonId}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted.current) {
            setContent(data.content || "");
          }
        }
      } catch (err) {
        console.error("Failed to fetch note:", err);
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    };
    fetchNote();

    return () => {
      isMounted.current = false;
    };
  }, [lessonId]);

  // 自動保存
  const saveNote = useCallback(
    async (newContent: string) => {
      setSaveStatus("保存中...");
      try {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lesson_id: lessonId, content: newContent }),
        });
        if (res.ok && isMounted.current) {
          setSaveStatus("保存済み");
          setTimeout(() => {
            if (isMounted.current) {
              setSaveStatus("");
            }
          }, 2000);
        }
      } catch (err) {
        console.error("Failed to save note:", err);
        if (isMounted.current) {
          setSaveStatus("");
        }
      }
    },
    [lessonId]
  );

  // 2秒デバウンスで自動保存
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      saveNote(newContent);
    }, 2000);
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return (
    <>
      {/* フローティングボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-brand hover:bg-brand-dark rounded-full flex items-center justify-center shadow-lg transition-colors duration-200"
        aria-label="メモを開く"
      >
        <StickyNote className="w-5 h-5 text-white" />
      </button>

      {/* メモパネル */}
      <div
        className={`fixed bottom-20 right-6 z-50 w-[300px] max-h-[400px] bg-surface-elevated border border-white/10 rounded-xl shadow-2xl flex flex-col transition-all duration-200 origin-bottom-right ${
          isOpen
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-200">メモ</h3>
          <div className="flex items-center gap-2">
            {saveStatus && (
              <span className="text-xs text-gray-400">{saveStatus}</span>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="メモを閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* テキストエリア */}
        <div className="flex-1 p-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-full min-h-[200px] text-gray-400 text-sm">
              読み込み中...
            </div>
          ) : (
            <textarea
              value={content}
              onChange={handleChange}
              placeholder="レッスンのメモをここに入力..."
              className="w-full h-full min-h-[300px] bg-surface border border-white/10 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-white/20 transition-colors"
            />
          )}
        </div>
      </div>
    </>
  );
}
