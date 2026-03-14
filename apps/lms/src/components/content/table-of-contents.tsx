"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { TocItem } from "@/lib/toc-utils";

interface TableOfContentsProps {
  items: TocItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Intersection Observer で現在表示中のセクションを追跡
  useEffect(() => {
    if (items.length === 0) return;

    // 既存のObserverをクリーンアップ
    observerRef.current?.disconnect();

    const headingElements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (headingElements.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // 画面内に入った見出しのうち、最も上にあるものをアクティブにする
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // boundingClientRect.top が最も小さい（最も上にある）ものを選択
          const topEntry = visibleEntries.reduce((prev, curr) =>
            prev.boundingClientRect.top < curr.boundingClientRect.top
              ? prev
              : curr
          );
          setActiveId(topEntry.target.id);
        }
      },
      {
        // ビューポート上部を重視して検出
        rootMargin: "0px 0px -70% 0px",
        threshold: 0,
      }
    );

    for (const el of headingElements) {
      observerRef.current.observe(el);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [items]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
        setActiveId(id);
      }
    },
    []
  );

  if (items.length === 0) return null;

  return (
    <nav className="sticky top-8" aria-label="目次">
      <p className="text-sm font-semibold text-gray-300 mb-3">目次</p>
      <ul className="space-y-1">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => handleClick(e, item.id)}
                className={cn(
                  "block py-1.5 text-sm leading-snug transition-colors border-l-2",
                  item.level === 3 ? "pl-6" : "pl-3",
                  isActive
                    ? "text-brand-light border-brand font-medium"
                    : "text-gray-400 border-transparent hover:text-white hover:border-white/30"
                )}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
