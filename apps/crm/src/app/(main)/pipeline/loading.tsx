export default function PipelineLoading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-6 bg-white/10 rounded w-32 mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-surface-card rounded-xl border border-white/10 p-3 space-y-3">
            <div className="h-4 bg-white/10 rounded w-20" />
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-16 bg-white/5 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
