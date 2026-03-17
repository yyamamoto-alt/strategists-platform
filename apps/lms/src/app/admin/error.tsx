"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin section error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-red-900/30 border border-red-500/30 flex items-center justify-center">
          <span className="text-xl text-red-400">!</span>
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">
          管理画面でエラーが発生しました
        </h2>
        <p className="text-sm text-gray-400 mb-6">
          処理中にエラーが発生しました。再度お試しください。
        </p>
        <button
          onClick={reset}
          className="px-5 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium transition-colors"
        >
          再度読み込み
        </button>
      </div>
    </div>
  );
}
