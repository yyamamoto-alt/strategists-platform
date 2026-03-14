"use client";

import { useState, useCallback, useEffect, ReactNode, useRef } from "react";
import { Highlighter, Bookmark, StickyNote } from "lucide-react";

interface MenuPosition {
  x: number;
  y: number;
  blockIndex: number;
}

interface Props {
  children: ReactNode;
  lessonId: string;
  onHighlight?: (blockIndex: number, color: string) => void;
  onBookmark?: (blockIndex: number) => void;
  onAddNote?: () => void;
}

export default function CustomContextMenu({
  children,
  lessonId,
  onHighlight,
  onBookmark,
  onAddNote,
}: Props) {
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const block = target.closest("[data-block-index]");
      if (!block) return;

      e.preventDefault();
      const blockIndex = parseInt(
        block.getAttribute("data-block-index") || "0",
        10
      );
      setMenu({ x: e.clientX, y: e.clientY, blockIndex });
    },
    []
  );

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  useEffect(() => {
    if (!menu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu, closeMenu]);

  const handleHighlight = () => {
    if (menu && onHighlight) {
      onHighlight(menu.blockIndex, "yellow");
    }
    closeMenu();
  };

  const handleBookmark = () => {
    if (menu && onBookmark) {
      onBookmark(menu.blockIndex);
    }
    closeMenu();
  };

  const handleAddNote = () => {
    if (onAddNote) {
      onAddNote();
    }
    closeMenu();
  };

  return (
    <div ref={containerRef} onContextMenu={handleContextMenu}>
      {children}

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-surface-elevated border border-white/10 rounded-lg shadow-xl py-1"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            onClick={handleHighlight}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            <Highlighter className="w-4 h-4 text-yellow-400" />
            ハイライト
          </button>
          <button
            onClick={handleBookmark}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            <Bookmark className="w-4 h-4 text-blue-400" />
            ブックマーク
          </button>
          <button
            onClick={handleAddNote}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            <StickyNote className="w-4 h-4 text-green-400" />
            ノートを追加
          </button>
        </div>
      )}
    </div>
  );
}
