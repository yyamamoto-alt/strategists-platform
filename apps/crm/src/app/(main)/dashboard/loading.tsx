export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-surface-card rounded-xl border border-white/10 p-4 h-24">
            <div className="h-3 bg-white/10 rounded w-20 mb-3" />
            <div className="h-6 bg-white/10 rounded w-28" />
          </div>
        ))}
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-surface-card rounded-xl border border-white/10 p-4 h-72">
            <div className="h-4 bg-white/10 rounded w-32 mb-4" />
            <div className="h-48 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
