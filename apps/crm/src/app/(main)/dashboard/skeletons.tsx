/** ダッシュボード各セクションのスケルトンUI */

export function HeaderSkeleton() {
  return (
    <div className="p-6 pb-0 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 bg-white/10 rounded w-48 mb-2" />
          <div className="h-4 bg-white/10 rounded w-32" />
        </div>
        <div className="h-4 bg-white/10 rounded w-36" />
      </div>
    </div>
  );
}

export function ChartsSkeleton() {
  return (
    <div className="px-6 animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 売上チャート */}
        <div className="bg-surface-card rounded-xl border border-white/10 p-6">
          <div className="h-5 bg-white/10 rounded w-24 mb-4" />
          <div className="space-y-3">
            <div className="flex items-end gap-2 h-48">
              {[40, 65, 50, 80, 55, 70, 45, 60, 75, 50, 85, 65].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-white/5 rounded-t"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-3 bg-white/5 rounded w-8" />
              ))}
            </div>
          </div>
        </div>
        {/* ファネルチャート */}
        <div className="bg-surface-card rounded-xl border border-white/10 p-6">
          <div className="h-5 bg-white/10 rounded w-28 mb-4" />
          <div className="space-y-3">
            <div className="flex items-end gap-2 h-48">
              {[70, 55, 80, 45, 60, 75, 50, 65, 40, 55, 70, 60].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-white/5 rounded-t"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-3 bg-white/5 rounded w-8" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReceivableSkeleton() {
  return (
    <div className="px-6 animate-pulse">
      <div className="bg-surface-card rounded-xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="h-5 bg-white/10 rounded w-20 mb-2" />
            <div className="h-3 bg-white/5 rounded w-32" />
          </div>
          <div className="text-right">
            <div className="h-7 bg-white/10 rounded w-36 mb-1" />
            <div className="h-3 bg-white/5 rounded w-10 ml-auto" />
          </div>
        </div>
        <div className="space-y-3">
          {[75, 50, 30].map((w, i) => (
            <div key={i}>
              <div className="flex justify-between mb-1.5">
                <div className="h-4 bg-white/10 rounded w-24" />
                <div className="h-4 bg-white/10 rounded w-20" />
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-white/10 rounded-full" style={{ width: `${w}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChannelSkeleton() {
  return (
    <div className="px-6 animate-pulse">
      <div className="bg-surface-card rounded-xl border border-white/10 p-4">
        <div className="h-4 bg-white/10 rounded w-36 mb-2" />
        <div className="h-3 bg-white/5 rounded w-52 mb-3" />
        <div className="flex flex-wrap gap-2">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded border border-white/10 px-2 py-1.5 h-8 w-28 bg-white/[0.02]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdsSummarySkeleton() {
  return (
    <div className="px-6 animate-pulse">
      <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="h-4 bg-white/10 rounded w-32 mb-1" />
            <div className="h-3 bg-white/5 rounded w-52" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 bg-white/5 rounded w-32" />
            <div className="h-8 bg-white/5 rounded w-24" />
          </div>
        </div>
        <div className="p-4 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 bg-white/5 rounded w-16" />
              <div className="h-4 bg-white/5 rounded w-20" />
              <div className="h-4 bg-white/5 rounded w-12" />
              <div className="h-4 bg-white/5 rounded w-12" />
              <div className="h-4 bg-white/5 rounded w-12" />
              <div className="h-4 bg-white/5 rounded w-16" />
              <div className="h-4 bg-white/5 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function InsightsSkeleton() {
  return (
    <div className="px-6 pb-6 animate-pulse">
      <div className="bg-surface-card rounded-xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-5 bg-white/10 rounded w-28" />
            <div className="h-3 bg-white/5 rounded w-40" />
          </div>
          <div className="h-9 bg-white/10 rounded w-28" />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="border-l-2 border-white/10 bg-white/[0.02] rounded-r-lg px-4 py-3"
            >
              <div className="h-3 bg-white/10 rounded w-16 mb-2" />
              <div className="h-4 bg-white/10 rounded w-64 mb-1" />
              <div className="h-3 bg-white/5 rounded w-full" />
              <div className="h-3 bg-white/5 rounded w-3/4 mt-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
