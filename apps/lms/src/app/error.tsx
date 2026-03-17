"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center">
          <span className="text-2xl text-red-400">!</span>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">
          エラーが発生しました
        </h2>
        <p className="text-sm text-gray-400 mb-6">
          予期しないエラーが発生しました。問題が続く場合は、ページを再読み込みしてください。
        </p>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors"
        >
          再度読み込み
        </button>
      </div>
    </div>
  );
}
