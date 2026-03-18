"use client";

import { useState, useCallback, useEffect } from "react";
import type { AutomationsClientProps, SlackChannel, NotificationLog } from "@/components/automations/shared";
import { SYSTEM_AUTOMATIONS } from "@/components/automations/shared";
import { SystemAutomationCard } from "@/components/automations/SystemAutomationCard";
import { AutomationCard } from "@/components/automations/AutomationCard";
import { AddEditModal } from "@/components/automations/AddEditModal";
import { NotificationLogsPanel } from "@/components/automations/NotificationLogsPanel";
import { RemindersPanel } from "@/components/automations/RemindersPanel";

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
  const [activeTab, setActiveTab] = useState<"all" | "cron" | "webhook" | "user" | "logs" | "reminders">("all");

  // システム自動化 ON/OFF 状態
  const [systemStates, setSystemStates] = useState<Record<string, boolean>>({});
  const [systemStatesLoading, setSystemStatesLoading] = useState(false);

  // システム自動化 設定オーバーライド
  const [systemConfigs, setSystemConfigs] = useState<Record<string, Record<string, string | number>>>({});

  // チャンネル名マッピング (ID → name)
  const [channelNames, setChannelNames] = useState<Record<string, string>>({});

  // 手動実行中のautomation ID
  const [runningId, setRunningId] = useState<string | null>(null);

  // システム自動化のnotification logs (type=system)
  const [systemLogs, setSystemLogs] = useState<Record<string, NotificationLog[]>>({});

  // 通知ログ
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [notifLogsLoading, setNotifLogsLoading] = useState(false);
  const [notifLogsCount, setNotifLogsCount] = useState(0);

  // リマインド対象
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [salesReminders, setSalesReminders] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [mentorReminders, setMentorReminders] = useState<any[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);

  useEffect(() => {
    if (initialAutomations.length === 0) {
      fetch("/api/automations")
        .then((res) => res.ok ? res.json() : [])
        .then((data) => { if (data.length > 0) setAutomations(data); })
        .catch(() => {});
    }
  }, [initialAutomations.length]);

  // システム自動化の状態 + 設定オーバーライドを取得
  useEffect(() => {
    setSystemStatesLoading(true);
    fetch("/api/system-automations")
      .then(r => r.json())
      .then(data => {
        // 新しいAPI形式: { states: {...}, configs: {...} }
        if (data.states) {
          setSystemStates(data.states);
          setSystemConfigs(data.configs || {});
        } else {
          // 旧API形式（互換）
          setSystemStates(data);
        }
      })
      .catch(() => {})
      .finally(() => setSystemStatesLoading(false));
  }, []);

  // Slackチャンネル一覧取得（チャンネル名解決用）
  const loadChannels = useCallback(async () => {
    if (channels.length > 0) return;
    setLoadingChannels(true);
    try {
      const res = await fetch("/api/slack-channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
        // チャンネル名マッピング構築
        const names: Record<string, string> = {};
        for (const ch of data) {
          names[ch.id] = ch.name;
        }
        setChannelNames(names);
      }
    } catch {
      // ignore
    } finally {
      setLoadingChannels(false);
    }
  }, [channels.length]);

  // 初回ロード時にチャンネル一覧を取得（チャンネル名表示用）
  useEffect(() => {
    loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // システム自動化トグル
  const toggleSystemAutomation = useCallback(async (id: string) => {
    const currentlyEnabled = systemStates[id] !== false; // default ON
    try {
      const res = await fetch("/api/system-automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled: !currentlyEnabled }),
      });
      if (res.ok) {
        setSystemStates(prev => ({ ...prev, [id]: !currentlyEnabled }));
      }
    } catch {}
  }, [systemStates]);

  // 設定オーバーライド保存
  const saveSystemConfig = useCallback(async (automationId: string, overrides: Record<string, string | number>) => {
    const res = await fetch("/api/system-automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automationId, overrides }),
    });
    if (res.ok) {
      setSystemConfigs(prev => ({ ...prev, [automationId]: { ...prev[automationId], ...overrides } }));
    }
  }, []);

  // 手動実行
  const runManually = useCallback(async (automationId: string) => {
    setRunningId(automationId);
    try {
      const res = await fetch("/api/system-automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId }),
      });
      const result = await res.json();
      if (result.status === "success") {
        alert(`実行完了: ${automationId}`);
      } else {
        alert(`実行失敗: ${result.error || result.result?.error || "不明なエラー"}`);
      }
    } catch (err) {
      alert(`実行エラー: ${err instanceof Error ? err.message : "不明"}`);
    } finally {
      setRunningId(null);
    }
  }, []);

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

  // 通知ログ取得
  const loadNotificationLogs = useCallback(async () => {
    setNotifLogsLoading(true);
    try {
      const res = await fetch("/api/notification-logs?limit=100");
      if (res.ok) {
        const data = await res.json();
        setNotificationLogs(data.data || []);
        setNotifLogsCount(data.count || 0);
      }
    } catch {
      // ignore
    } finally {
      setNotifLogsLoading(false);
    }
  }, []);

  // リマインド対象取得
  const loadReminders = useCallback(async () => {
    setRemindersLoading(true);
    try {
      const res = await fetch("/api/reminders/today");
      if (res.ok) {
        const data = await res.json();
        setSalesReminders(data.sales_reminders || []);
        setMentorReminders(data.mentor_reminders || []);
      }
    } catch {
      // ignore
    } finally {
      setRemindersLoading(false);
    }
  }, []);

  // タブ切り替え時にデータ取得
  useEffect(() => {
    if (activeTab === "logs" && notificationLogs.length === 0) {
      loadNotificationLogs();
    }
    if (activeTab === "reminders" && salesReminders.length === 0 && mentorReminders.length === 0) {
      loadReminders();
    }
  }, [activeTab, notificationLogs.length, salesReminders.length, mentorReminders.length, loadNotificationLogs, loadReminders]);

  const userActiveCount = automations.filter((a) => a.is_active).length;
  const systemActiveCount = SYSTEM_AUTOMATIONS.filter((a) => systemStates[a.id] !== false).length;
  const totalCount = SYSTEM_AUTOMATIONS.length + automations.length;
  const totalActive = systemActiveCount + userActiveCount;

  // フィルタリング
  const filteredSystem = activeTab === "user" ? [] : SYSTEM_AUTOMATIONS.filter((a) => {
    if (activeTab === "all") return true;
    return a.category === activeTab;
  });
  const showUserAutomations = activeTab === "all" || activeTab === "user";

  return (
    <div className="p-6 max-w-6xl">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">自動連携</h1>
            <span className="px-2 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-800 border border-white/10 rounded">
              旧 Zapier
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Webhook・定時実行・フォーム連携を一元管理。トリガーに応じたアクションを自動実行します。
          </p>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs text-gray-500">
              {totalCount}件の連携 / {totalActive}件 ON
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

      {/* タブ */}
      <div className="flex items-center gap-1 mb-4 bg-gray-800/50 rounded-lg p-1 w-fit">
        {[
          { key: "all" as const, label: "すべて" },
          { key: "cron" as const, label: "定時実行" },
          { key: "webhook" as const, label: "Webhook" },
          { key: "user" as const, label: "カスタム" },
          { key: "logs" as const, label: "通知ログ" },
          { key: "reminders" as const, label: "リマインド" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              activeTab === tab.key
                ? "bg-white/10 text-white font-medium"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* コンテンツ: 自動化一覧 / 通知ログ / リマインド */}
      {activeTab === "logs" ? (
        <NotificationLogsPanel
          logs={notificationLogs}
          count={notifLogsCount}
          loading={notifLogsLoading}
          onRefresh={loadNotificationLogs}
        />
      ) : activeTab === "reminders" ? (
        <RemindersPanel
          salesReminders={salesReminders}
          mentorReminders={mentorReminders}
          loading={remindersLoading}
          onRefresh={loadReminders}
        />
      ) : (
        <>
          <div className="space-y-3">
            {/* システム自動化 */}
            {filteredSystem.map((sa) => (
              <SystemAutomationCard
                key={sa.id}
                automation={sa}
                isEnabled={systemStates[sa.id] !== false}
                onToggle={() => toggleSystemAutomation(sa.id)}
                configOverrides={systemConfigs[sa.id] || {}}
                channelNames={channelNames}
                slackChannels={channels}
                onSaveConfig={saveSystemConfig}
                logs={systemLogs[sa.id] || []}
                onRunManually={runManually}
                runningManually={runningId === sa.id}
              />
            ))}

            {/* ユーザー定義自動化 */}
            {showUserAutomations && automations.map((a) => {
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

          {filteredSystem.length === 0 && (!showUserAutomations || automations.length === 0) && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-sm">このカテゴリの自動連携はありません</p>
            </div>
          )}
        </>
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
