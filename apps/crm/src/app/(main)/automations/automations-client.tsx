"use client";

import { useState, useCallback, useEffect } from "react";
import type { Automation, AutomationLog } from "@/lib/data/automations";

interface AutomationsClientProps {
  initialAutomations: Automation[];
  initialLogs: AutomationLog[];
}

interface SlackChannel {
  id: string;
  name: string;
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function statusBadge(status: string) {
  switch (status) {
    case "success":
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/50 text-green-300">
          成功
        </span>
      );
    case "failed":
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/50 text-red-300">
          失敗
        </span>
      );
    case "no_new_rows":
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700/50 text-gray-400">
          新規なし
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700/50 text-gray-400">
          {status}
        </span>
      );
  }
}

export function AutomationsClient({
  initialAutomations,
  initialLogs,
}: AutomationsClientProps) {
  const [automations, setAutomations] = useState(initialAutomations);
  const [logs, setLogs] = useState(initialLogs);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Slackチャンネル一覧取得
  const loadChannels = useCallback(async () => {
    if (channels.length > 0) return;
    setLoadingChannels(true);
    try {
      const res = await fetch("/api/slack-channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingChannels(false);
    }
  }, [channels.length]);

  // ON/OFFトグル
  const toggleActive = useCallback(async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAutomations((prev) =>
          prev.map((a) => (a.id === id ? updated : a))
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // 削除
  const deleteAutomation = useCallback(async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/automations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAutomations((prev) => prev.filter((a) => a.id !== id));
        setLogs((prev) => prev.filter((l) => l.automation_id !== id));
      }
    } catch {
      // ignore
    }
  }, []);

  // ログ取得
  const loadLogs = useCallback(async (automationId: string) => {
    if (expandedLogId === automationId) {
      setExpandedLogId(null);
      return;
    }
    try {
      const res = await fetch(`/api/automations/${automationId}/logs`);
      if (res.ok) {
        const data = await res.json();
        // 既存ログを更新（このautomation分だけ）
        setLogs((prev) => {
          const others = prev.filter((l) => l.automation_id !== automationId);
          return [...others, ...data];
        });
      }
    } catch {
      // ignore
    }
    setExpandedLogId(automationId);
  }, [expandedLogId]);

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">自動連携</h1>
          <p className="text-sm text-gray-400 mt-1">
            Google Forms/Sheets → Slack通知の自動連携を管理
          </p>
        </div>
        <button
          onClick={() => {
            loadChannels();
            setShowAddModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          + 新規追加
        </button>
      </div>

      {/* 一覧テーブル */}
      {automations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">自動連携がまだありません</p>
          <p className="text-sm">
            「+ 新規追加」から Google Forms の回答シートを連携してください
          </p>
        </div>
      ) : (
        <div className="bg-surface-raised border border-white/10 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">
                  連携名
                </th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">
                  通知先
                </th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">
                  顧客紐付
                </th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">
                  最終実行
                </th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium">
                  状態
                </th>
                <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {automations.map((a) => {
                const automationLogs = logs
                  .filter((l) => l.automation_id === a.id)
                  .slice(0, 10);

                return (
                  <AutomationRow
                    key={a.id}
                    automation={a}
                    automationLogs={automationLogs}
                    isExpanded={expandedLogId === a.id}
                    onToggle={() => toggleActive(a.id, a.is_active)}
                    onDelete={() => deleteAutomation(a.id, a.name)}
                    onEdit={() => {
                      loadChannels();
                      setEditingId(a.id);
                    }}
                    onToggleLogs={() => loadLogs(a.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 新規追加モーダル */}
      {showAddModal && (
        <AddEditModal
          channels={channels}
          loadingChannels={loadingChannels}
          onClose={() => setShowAddModal(false)}
          onSaved={(newAutomation) => {
            setAutomations((prev) => [newAutomation, ...prev]);
            setShowAddModal(false);
          }}
        />
      )}

      {/* 編集モーダル */}
      {editingId && (
        <AddEditModal
          automation={automations.find((a) => a.id === editingId)}
          channels={channels}
          loadingChannels={loadingChannels}
          onClose={() => setEditingId(null)}
          onSaved={(updated) => {
            setAutomations((prev) =>
              prev.map((a) => (a.id === updated.id ? updated : a))
            );
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

// ================================================================
// AutomationRow
// ================================================================
function AutomationRow({
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
  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/5">
        <td className="px-4 py-3">
          <div>
            <span className="text-white font-medium">{automation.name}</span>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">
              {automation.spreadsheet_id}
            </p>
          </div>
        </td>
        <td className="px-4 py-3 text-gray-300">
          #{automation.slack_channel_name || automation.slack_channel_id}
        </td>
        <td className="px-4 py-3">
          {automation.link_to_customer ? (
            <span className="text-xs text-blue-400">あり</span>
          ) : (
            <span className="text-xs text-gray-500">なし</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">
          {formatDate(automation.last_triggered_at)}
        </td>
        <td className="px-4 py-3">
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
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onToggleLogs}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              ログ
            </button>
            <button
              onClick={onEdit}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              編集
            </button>
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              削除
            </button>
          </div>
        </td>
      </tr>
      {/* ログ展開 */}
      {isExpanded && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-black/20">
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
          </td>
        </tr>
      )}
    </>
  );
}

// ================================================================
// AddEditModal
// ================================================================
function AddEditModal({
  automation,
  channels,
  loadingChannels,
  onClose,
  onSaved,
}: {
  automation?: Automation;
  channels: SlackChannel[];
  loadingChannels: boolean;
  onClose: () => void;
  onSaved: (a: Automation) => void;
}) {
  const isEdit = !!automation;
  const [name, setName] = useState(automation?.name || "");
  const [spreadsheetId, setSpreadsheetId] = useState(
    automation?.spreadsheet_id || ""
  );
  const [sheetName, setSheetName] = useState(automation?.sheet_name || "");
  const [slackChannelId, setSlackChannelId] = useState(
    automation?.slack_channel_id || ""
  );
  const [messageTemplate, setMessageTemplate] = useState(
    automation?.message_template || ""
  );
  const [linkToCustomer, setLinkToCustomer] = useState(
    automation?.link_to_customer || false
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // チャンネル名を取得
  const selectedChannelName =
    channels.find((c) => c.id === slackChannelId)?.name || "";

  const handleSave = async () => {
    if (!name.trim() || !spreadsheetId.trim() || !slackChannelId) {
      setError("連携名、スプレッドシートID/URL、通知先チャンネルは必須です");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const payload = {
        name: name.trim(),
        spreadsheet_id: spreadsheetId.trim(),
        sheet_name: sheetName.trim() || "Sheet1",
        slack_channel_id: slackChannelId,
        slack_channel_name: selectedChannelName,
        message_template: messageTemplate.trim() || null,
        link_to_customer: linkToCustomer,
      };

      const url = isEdit
        ? `/api/automations/${automation.id}`
        : "/api/automations";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "保存に失敗しました");
        return;
      }

      const saved = await res.json();
      onSaved(saved);
    } catch {
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold text-white mb-4">
          {isEdit ? "連携を編集" : "新規連携を追加"}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* 連携名 */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">連携名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 面接振り返り通知"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* スプレッドシートID/URL */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              スプレッドシートURL or ID
            </label>
            <input
              type="text"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/... or ID"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              ※ サービスアカウント (strategists-sheets-reader@...) に閲覧権限を付与してください
            </p>
          </div>

          {/* シート名 */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">シート名</label>
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Sheet1（デフォルト）"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Slackチャンネル */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              通知先Slackチャンネル
            </label>
            {loadingChannels ? (
              <p className="text-xs text-gray-500">チャンネル一覧を読み込み中...</p>
            ) : (
              <select
                value={slackChannelId}
                onChange={(e) => setSlackChannelId(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">選択してください</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    #{ch.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* メッセージテンプレート */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              通知テンプレート（任意）
            </label>
            <textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="空欄の場合、全フィールドをそのまま表示します。&#10;例: *{{名前}}* さんが面接振り返りを提出しました&#10;評価: {{総合評価}}"
              rows={4}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              {"{{ヘッダー名}}"} でシートのカラム値を挿入できます
            </p>
          </div>

          {/* 顧客紐付け */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="linkToCustomer"
              checked={linkToCustomer}
              onChange={(e) => setLinkToCustomer(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="linkToCustomer" className="text-sm text-gray-300">
              顧客DBに紐付ける
            </label>
          </div>
        </div>

        {/* アクション */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? "保存中..." : isEdit ? "更新" : "追加"}
          </button>
        </div>
      </div>
    </div>
  );
}
