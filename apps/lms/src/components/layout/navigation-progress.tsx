"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const start = useCallback(() => {
    setProgress(0);
    setVisible(true);
    // 段階的に進捗を進める
    setTimeout(() => setProgress(30), 50);
    setTimeout(() => setProgress(60), 300);
    setTimeout(() => setProgress(80), 600);
  }, []);

  const done = useCallback(() => {
    setProgress(100);
    setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  }, []);

  // パス変更を検知して完了
  useEffect(() => {
    done();
  }, [pathname, searchParams, done]);

  // グローバルにstart関数を公開（サイドバーから呼べるように）
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__startNavProgress = start;
    return () => {
      delete (window as unknown as Record<string, unknown>).__startNavProgress;
    };
  }, [start]);

  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5">
      <div
        className="h-full bg-gradient-to-r from-red-600 via-red-500 to-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)] transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}

/** サイドバー等からプログレスバーを開始するヘルパー */
export function startNavigationProgress() {
  const fn = (window as unknown as Record<string, unknown>).__startNavProgress;
  if (typeof fn === "function") (fn as () => void)();
}
