export default function RevenueLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-6 bg-white/10 rounded w-24" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-surface-card rounded-xl border border-white/10 p-4 h-24">
            <div className="h-3 bg-white/10 rounded w-20 mb-3" />
            <div className="h-6 bg-white/10 rounded w-28" />
          </div>
        ))}
      </div>
      <div className="bg-surface-card rounded-xl border border-white/10 p-4 h-72">
        <div className="h-4 bg-white/10 rounded w-32 mb-4" />
        <div className="h-52 bg-white/5 rounded" />
      </div>
    </div>
  );
}
