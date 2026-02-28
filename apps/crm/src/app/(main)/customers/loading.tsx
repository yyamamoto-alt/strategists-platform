export default function CustomersLoading() {
  return (
    <div className="p-4 space-y-2 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-6 bg-white/10 rounded w-24" />
        <div className="h-5 bg-white/10 rounded w-12" />
        <div className="h-7 bg-white/10 rounded w-20" />
        <div className="h-7 bg-white/10 rounded w-24" />
      </div>
      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-elevated rounded-lg p-1 w-fit">
        {["全般", "マーケ", "営業", "エデュ", "エージェント"].map((t) => (
          <div key={t} className="h-7 bg-white/10 rounded px-4 w-16" />
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
        <div className="bg-surface-elevated border-b border-white/10 h-9" />
        {[...Array(20)].map((_, i) => (
          <div key={i} className="flex border-b border-white/[0.08] h-9 items-center px-2 gap-4">
            <div className="h-3 bg-white/10 rounded w-24" />
            <div className="h-3 bg-white/10 rounded w-20" />
            <div className="h-3 bg-white/10 rounded w-16" />
            <div className="h-3 bg-white/10 rounded w-28" />
            <div className="h-3 bg-white/10 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
