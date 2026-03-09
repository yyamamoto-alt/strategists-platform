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

// ================================================================
// アイコンコンポーネント
// ================================================================

function GoogleSheetsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="1" width="18" height="22" rx="2" fill="#0F9D58" />
      <rect x="6" y="5" width="12" height="14" rx="1" fill="white" />
      <line x1="6" y1="9" x2="18" y2="9" stroke="#0F9D58" strokeWidth="0.8" />
      <line x1="6" y1="12" x2="18" y2="12" stroke="#0F9D58" strokeWidth="0.8" />
      <line x1="6" y1="15" x2="18" y2="15" stroke="#0F9D58" strokeWidth="0.8" />
      <line x1="12" y1="5" x2="12" y2="19" stroke="#0F9D58" strokeWidth="0.8" />
    </svg>
  );
}

function SlackIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
      <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
      <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
    </svg>
  );
}

function DatabaseIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

// ================================================================
// ステップ数計算
// ================================================================

function getStepCount(a: Automation): number {
  // 基本: トリガー(1) + Slack通知(1) = 2
  let steps = 2;
  // 顧客紐付あり → +1
  if (a.link_to_customer) steps++;
  // メッセージテンプレートあり → カスタム整形 +1
  if (a.message_template) steps++;
  return steps;
}

// ================================================================
// フロー可視化コンポーネント
// ================================================================

function AutomationFlow({ automation }: { automation: Automation }) {
  const steps = getStepCount(automation);

  return (
    <div className="flex items-center gap-1.5">
      {/* トリガー: Google Sheets */}
      <div className="flex items-center gap-1 px-2 py-1 bg-green-900/20 border border-green-800/30 rounded text-xs text-green-300">
        <GoogleSheetsIcon className="w-3.5 h-3.5" />
        <span>新規行</span>
      </div>

      <ArrowIcon />

      {/* アクション: Slack */}
      <div className="flex items-center gap-1 px-2 py-1 bg-purple-900/20 border border-purple-800/30 rounded text-xs text-purple-300">
        <SlackIcon className="w-3.5 h-3.5" />
        <span>通知</span>
      </div>

      {/* 顧客紐付あり */}
      {automation.link_to_customer && (
        <>
          <span className="text-gray-600">+</span>
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-900/20 border border-blue-800/30 rounded text-xs text-blue-300">
            <DatabaseIcon className="w-3.5 h-3.5" />
            <span>DB更新</span>
          </div>
        </>
      )}

      {/* ステップ数 */}
      <span className="ml-1.5 px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-800 rounded">
        {steps}ステップ
      </span>
    </div>
  );
}

// ================================================================
// メインコンポーネント
// ================================================================

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

  // サーバーサイドで空の場合、クライアント側でAPIから再取得
  useEffect(() => {
    if (initialAutomations.length === 0) {
      fetch("/api/automations")
        .then((res) => res.ok ? res.json() : [])
        .then((data) => { if (data.length > 0) setAutomations(data); })
        .catch(() => {});
    }
  }, [initialAutomations.length]);

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

  const activeCount = automations.filter((a) => a.is_active).length;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">自動連携</h1>
            <span className="px-2 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-800 border border-white/10 rounded">
              旧 Zapier
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Google Forms/Sheets の新規行を検知して Slack 通知・顧客DB更新を自動実行
          </p>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs text-gray-500">
              {automations.length}件の連携 / {activeCount}件 ON
            </span>
          </div>
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

      {/* 一覧 */}
      {automations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">自動連携がまだありません</p>
          <p className="text-sm">
            「+ 新規追加」から Google Forms の回答シートを連携してください
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => {
            const automationLogs = logs
              .filter((l) => l.automation_id === a.id)
              .slice(0, 10);

            return (
              <AutomationCard
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
// AutomationCard（カード形式に変更 — 旧テーブル行から）
// ================================================================
function AutomationCard({
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
      {/* メイン行 */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          {/* 左: 名前 + フロー */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white font-medium">{automation.name}</span>
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

            {/* フロー可視化 */}
            <AutomationFlow automation={automation} />

            {/* 詳細メタ */}
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

          {/* 右: 操作ボタン */}
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

      {/* ログ展開 */}
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
              placeholder={"空欄の場合、全フィールドをそのまま表示します。\n例: *{{名前}}* さんが面接振り返りを提出しました\n評価: {{総合評価}}"}
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
