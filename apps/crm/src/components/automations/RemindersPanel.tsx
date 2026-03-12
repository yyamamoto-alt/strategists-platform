"use client";

export function RemindersPanel({
  salesReminders,
  mentorReminders,
  loading,
  onRefresh,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  salesReminders: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mentorReminders: any[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          本日のリマインド対象一覧
        </p>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-white/10 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          {loading ? "読み込み中..." : "更新"}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">読み込み中...</p>
        </div>
      ) : (
        <>
          {/* 営業リマインド */}
          <div className="bg-surface-raised border border-white/10 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
              <span className="text-sm font-medium text-white">営業リマインド</span>
              <span className="px-2 py-0.5 text-[10px] bg-amber-900/30 text-amber-300 rounded-full">
                {salesReminders.length}件
              </span>
            </div>
            {salesReminders.length === 0 ? (
              <div className="px-5 py-6 text-center text-gray-500 text-xs">
                本日連絡予定の案件はありません
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 bg-black/20">
                    <th className="text-left py-2 px-4">顧客名</th>
                    <th className="text-left py-2 px-4">ステージ</th>
                    <th className="text-left py-2 px-4">担当者</th>
                    <th className="text-left py-2 px-4">連絡予定日</th>
                    <th className="text-left py-2 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {salesReminders.map((r: { id: string; customers?: { name?: string }; stage: string; sales_person?: string; response_date: string; customer_id: string }) => (
                    <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 px-4 text-white">
                        {r.customers?.name || "不明"}
                      </td>
                      <td className="py-2 px-4 text-gray-300">{r.stage}</td>
                      <td className="py-2 px-4 text-gray-300">{r.sales_person || "未設定"}</td>
                      <td className="py-2 px-4 text-gray-400">{r.response_date}</td>
                      <td className="py-2 px-4">
                        <a
                          href={`/customers/${r.customer_id}`}
                          className="text-blue-400 hover:text-blue-300 text-xs"
                        >
                          詳細
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* メンターリマインド */}
          <div className="bg-surface-raised border border-white/10 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
              <span className="text-sm font-medium text-white">メンターリマインド</span>
              <span className="px-2 py-0.5 text-[10px] bg-blue-900/30 text-blue-300 rounded-full">
                {mentorReminders.length}件
              </span>
              <span className="text-[10px] text-gray-500">（指導終了30日以内）</span>
            </div>
            {mentorReminders.length === 0 ? (
              <div className="px-5 py-6 text-center text-gray-500 text-xs">
                今後30日以内に指導期間が終了するメンターはいません
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 bg-black/20">
                    <th className="text-left py-2 px-4">メンター</th>
                    <th className="text-left py-2 px-4">受講者</th>
                    <th className="text-left py-2 px-4">指導終了日</th>
                    <th className="text-left py-2 px-4">残日数</th>
                  </tr>
                </thead>
                <tbody>
                  {mentorReminders.map((r: { id: string; mentor_name?: string; customers?: { name?: string }; coaching_end_date: string }) => {
                    const endDate = new Date(r.coaching_end_date);
                    const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                        <td className="py-2 px-4 text-white">{r.mentor_name || "不明"}</td>
                        <td className="py-2 px-4 text-gray-300">{r.customers?.name || "不明"}</td>
                        <td className="py-2 px-4 text-gray-400">{r.coaching_end_date}</td>
                        <td className="py-2 px-4">
                          <span className={`${
                            daysLeft <= 0 ? "text-red-400 font-medium" :
                            daysLeft <= 7 ? "text-amber-400" :
                            "text-gray-300"
                          }`}>
                            {daysLeft <= 0 ? "本日終了" : `${daysLeft}日`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
