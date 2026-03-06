export default function AnalyticsLoading() {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
      <div className="flex items-center gap-3">
        <svg className="animate-spin h-6 w-6 text-brand" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-gray-400">データを読み込み中...</p>
      </div>
    </div>
  );
}
