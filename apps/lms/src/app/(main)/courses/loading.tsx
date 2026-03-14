export default function CoursesLoading() {
  return (
    <div className="p-5 bg-surface min-h-screen max-w-4xl animate-pulse">
      <div className="h-7 w-32 bg-white/[0.06] rounded mb-4" />
      {[1, 2, 3].map((section) => (
        <div key={section} className="mb-5">
          <div className="flex items-center gap-2 mb-1 px-1">
            <div className="w-1.5 h-4 rounded-sm bg-white/[0.06]" />
            <div className="h-3 w-20 bg-white/[0.06] rounded" />
          </div>
          <div className="border border-white/[0.06] rounded-lg divide-y divide-white/[0.04] bg-white/[0.02]">
            {[1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-3 px-3 py-2.5">
                <div className="w-4 h-4 bg-white/[0.06] rounded" />
                <div className="h-4 bg-white/[0.06] rounded flex-1 max-w-[250px]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
