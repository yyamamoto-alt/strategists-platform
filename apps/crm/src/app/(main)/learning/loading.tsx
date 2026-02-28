export default function LearningLoading() {
  return (
    <div className="p-4 space-y-2 animate-pulse">
      <div className="h-6 bg-white/10 rounded w-24 mb-2" />
      <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
        <div className="bg-surface-elevated border-b border-white/10 h-9" />
        {[...Array(15)].map((_, i) => (
          <div key={i} className="flex border-b border-white/[0.08] h-9 items-center px-2 gap-4">
            <div className="h-3 bg-white/10 rounded w-24" />
            <div className="h-3 bg-white/10 rounded w-16" />
            <div className="h-3 bg-white/10 rounded w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
