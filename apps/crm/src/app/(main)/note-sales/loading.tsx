export default function NoteSalesLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* ヘッダー */}
      <div>
        <div className="h-8 w-48 bg-white/10 rounded" />
        <div className="h-4 w-64 bg-white/5 rounded mt-2" />
      </div>

      {/* 月別サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-surface-raised border border-white/10 rounded-xl p-5 space-y-2"
          >
            <div className="h-3 w-12 bg-white/10 rounded" />
            <div className="h-7 w-32 bg-white/10 rounded" />
            <div className="h-3 w-8 bg-white/5 rounded" />
          </div>
        ))}
      </div>

      {/* テーブルスケルトン */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              {["購入日時", "購入者", "商品名", "金額", "商品タイプ"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-3">
                  <div className="h-4 w-36 bg-white/10 rounded" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-24 bg-white/10 rounded" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-48 bg-white/10 rounded" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-20 bg-white/10 rounded ml-auto" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-5 w-16 bg-white/10 rounded-full" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
