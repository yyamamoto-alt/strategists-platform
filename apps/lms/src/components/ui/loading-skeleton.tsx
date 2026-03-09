"use client";

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-white/[0.06] ${className}`}
    />
  );
}

/** テーブル型ページ用のローディングスケルトン */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 w-full">
      <div className="w-full max-w-4xl space-y-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <Shimmer className="h-8 w-48" />
          <Shimmer className="h-9 w-32 rounded-lg" />
        </div>
        {/* テーブルヘッダー */}
        <div className="flex gap-4 px-4 py-3 border-b border-white/10">
          {[1, 2, 3, 4, 5].map((i) => (
            <Shimmer key={i} className="h-4 flex-1" />
          ))}
        </div>
        {/* テーブル行 */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b border-white/5">
            {[1, 2, 3, 4, 5].map((j) => (
              <Shimmer key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** カード型ページ用のローディングスケルトン */
export function CardSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 w-full">
      <div className="w-full max-w-5xl space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <Shimmer className="h-8 w-48" />
          <Shimmer className="h-9 w-32 rounded-lg" />
        </div>
        {/* カードグリッド */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: cards }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-surface-elevated p-5 space-y-3"
            >
              <Shimmer className="h-32 w-full rounded-lg" />
              <Shimmer className="h-5 w-3/4" />
              <Shimmer className="h-4 w-1/2" />
              <div className="flex gap-2 pt-2">
                <Shimmer className="h-6 w-16 rounded-full" />
                <Shimmer className="h-6 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 汎用ページローディング（スピナー + テキスト） */
export function PageLoading({ message = "読み込み中..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}
