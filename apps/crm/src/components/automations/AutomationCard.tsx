"use client";

import type { Automation, AutomationLog } from "./shared";
import { formatDate, statusBadge, CategoryBadge, AutomationFlow, SlackIcon } from "./shared";

export function AutomationCard({
  automation,
  automationLogs,
  isExpanded,
  onToggle,
  onDelete,
  onEdit,
  onToggleLogs,
}: {
  automation: Automation;
  automationLogs: AutomationLog[];
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggleLogs: () => void;
}) {
  const lastLog = automationLogs[0];

  return (
    <div className={`bg-surface-raised border rounded-lg overflow-hidden transition-colors ${
      automation.is_active ? "border-white/10" : "border-white/5 opacity-60"
    }`}>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white font-medium">{automation.name}</span>
              <CategoryBadge category="user" />
              <button
                onClick={onToggle}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  automation.is_active ? "bg-green-600" : "bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    automation.is_active ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <AutomationFlow automation={automation} />

            <div className="flex items-center gap-4 mt-2.5 text-xs text-gray-500">
              <span>
                <SlackIcon className="w-3 h-3 inline mr-1" />
                #{automation.slack_channel_name || automation.slack_channel_id}
              </span>
              <span>シート: {automation.sheet_name || "Sheet1"}</span>
              {lastLog && (
                <span>
                  最終: {formatDate(lastLog.triggered_at)}
                  {" "}{statusBadge(lastLog.status)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onToggleLogs}
              className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
            >
              ログ {isExpanded ? "▲" : "▼"}
            </button>
            <button
              onClick={onEdit}
              className="px-2.5 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded transition-colors"
            >
              編集
            </button>
            <button
              onClick={onDelete}
              className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
            >
              削除
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-5 py-3 bg-black/20 border-t border-white/5">
          {automationLogs.length === 0 ? (
            <p className="text-xs text-gray-500">ログなし</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left py-1 pr-4">日時</th>
                  <th className="text-left py-1 pr-4">ステータス</th>
                  <th className="text-left py-1 pr-4">新規行</th>
                  <th className="text-left py-1 pr-4">通知数</th>
                  <th className="text-left py-1">エラー</th>
                </tr>
              </thead>
              <tbody>
                {automationLogs.map((log) => (
                  <tr key={log.id} className="border-t border-white/5">
                    <td className="py-1.5 pr-4 text-gray-400">
                      {formatDate(log.triggered_at)}
                    </td>
                    <td className="py-1.5 pr-4">{statusBadge(log.status)}</td>
                    <td className="py-1.5 pr-4 text-gray-300">
                      {log.new_rows_count}
                    </td>
                    <td className="py-1.5 pr-4 text-gray-300">
                      {log.notifications_sent}
                    </td>
                    <td className="py-1.5 text-red-400 truncate max-w-[200px]">
                      {log.error_message || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
