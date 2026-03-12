"use client";

import type { NotificationLog } from "./shared";
import { formatDate } from "./shared";

function notifTypeBadge(type: string) {
  const map: Record<string, { label: string; className: string }> = {
    sales_reminder: { label: "営業リマインド", className: "bg-amber-900/50 text-amber-300" },
    sales_auto_lost: { label: "自動失注", className: "bg-red-900/50 text-red-300" },
    mentor_reminder_30d: { label: "メンター30日前", className: "bg-blue-900/50 text-blue-300" },
    mentor_reminder_lastday: { label: "メンター最終日", className: "bg-purple-900/50 text-purple-300" },
    jicoo_booking: { label: "Jicoo予約", className: "bg-cyan-900/50 text-cyan-300" },
    payment_success: { label: "決済成功", className: "bg-green-900/50 text-green-300" },
    payment_error: { label: "決済エラー", className: "bg-red-900/50 text-red-300" },
    stage_transition: { label: "ステージ遷移", className: "bg-gray-700/50 text-gray-300" },
  };
  const entry = map[type] || { label: type, className: "bg-gray-700/50 text-gray-400" };
  return (
    <span className={`px-2 py-0.5 text-[10px] rounded-full ${entry.className}`}>
      {entry.label}
    </span>
  );
}

export function NotificationLogsPanel({
  logs,
  count,
  loading,
  onRefresh,
}: {
  logs: NotificationLog[];
  count: number;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-400">
          直近の通知送信履歴（{count}件）
        </p>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-white/10 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          {loading ? "読み込み中..." : "更新"}
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">読み込み中...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">通知ログはまだありません</p>
          <p className="text-xs mt-1">営業リマインド・メンターリマインド等が実行されるとここに記録されます</p>
        </div>
      ) : (
        <div className="bg-surface-raised border border-white/10 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 bg-black/20">
                <th className="text-left py-2 px-4">日時</th>
                <th className="text-left py-2 px-4">種別</th>
                <th className="text-left py-2 px-4">送信先</th>
                <th className="text-left py-2 px-4">ステータス</th>
                <th className="text-left py-2 px-4">メッセージ</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="py-2 px-4 text-gray-400 whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="py-2 px-4">
                    {notifTypeBadge(log.type)}
                  </td>
                  <td className="py-2 px-4 text-gray-300">
                    {log.channel ? `#${log.channel}` : log.recipient || "-"}
                  </td>
                  <td className="py-2 px-4">
                    {log.status === "success" ? (
                      <span className="text-green-400">成功</span>
                    ) : (
                      <span className="text-red-400" title={log.error_message || ""}>
                        失敗
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-gray-400 truncate max-w-[300px]">
                    {log.message.replace(/\*/g, "").substring(0, 80)}
                    {log.message.length > 80 ? "..." : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
