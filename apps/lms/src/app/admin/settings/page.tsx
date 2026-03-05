"use client";

import { useState, useEffect, useCallback } from "react";

interface Setting {
  key: string;
  value: unknown;
  description: string | null;
}

interface SlackChannel {
  id: string;
  name: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data: Setting[]) => {
        const map: Record<string, string> = {};
        for (const s of data) {
          map[s.key] = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
        }
        setSettings(map);
        setOriginal(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/admin/slack-channels")
      .then((r) => r.json())
      .then((data: SlackChannel[]) => {
        if (Array.isArray(data)) setChannels(data);
      })
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, []);

  const handleChange = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const settingKeys = ["auto_invite_enabled", "auto_invite_slack_channel"];
  const hasChanges = settingKeys.some((k) => settings[k] !== original[k]);

  const handleSave = async () => {
    setSaving(true);
    setToast(null);

    const updates = settingKeys
      .filter((k) => settings[k] !== original[k])
      .map((k) => ({ key: k, value: settings[k] }));

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) throw new Error("保存に失敗しました");

      setOriginal({ ...settings });
      setToast({ type: "success", text: "設定を保存しました" });
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast({ type: "error", text: "保存に失敗しました" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-surface min-h-screen">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  const toggleValue = settings["auto_invite_enabled"] || "";
  const toggleChanged = toggleValue !== (original["auto_invite_enabled"] || "");
  const channelValue = (settings["auto_invite_slack_channel"] || "").replace(/"/g, "");
  const channelChanged = channelValue !== (original["auto_invite_slack_channel"] || "").replace(/"/g, "");

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">LMS設定</h1>
            <p className="text-sm text-gray-400 mt-1">自動招待・通知の設定を管理します</p>
          </div>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
              hasChanges && !saving
                ? "bg-brand text-white hover:bg-brand-dark"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>

        {toast && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            toast.type === "success"
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}>
            {toast.text}
          </div>
        )}

        <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">自動招待</h2>
            <p className="text-xs text-gray-500 mt-1">
              入塾フォーム → Slack承認 → 招待メール送信の自動化設定
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {/* 自動招待トグル */}
            <div className="px-6 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-200">
                  自動招待を有効にする
                  {toggleChanged && (
                    <span className="ml-2 text-xs text-amber-400">(変更あり)</span>
                  )}
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  入塾フォーム受付時にSlack承認→自動でLMS招待メールを送信します
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleChange("auto_invite_enabled", toggleValue === "true" ? "false" : "true")}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  toggleValue === "true" ? "bg-brand" : "bg-gray-600"
                } ${toggleChanged ? "ring-2 ring-amber-500/50" : ""}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    toggleValue === "true" ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Slackチャンネル選択 */}
            <div className="px-6 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-200">
                  Slack通知チャンネル
                  {channelChanged && (
                    <span className="ml-2 text-xs text-amber-400">(変更あり)</span>
                  )}
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  承認リクエストを送信するSlackチャンネル
                </p>
              </div>
              <div>
                {channelsLoading ? (
                  <div className="w-52 px-3 py-2 text-sm text-gray-500 bg-surface-elevated border border-white/10 rounded-lg">
                    読み込み中...
                  </div>
                ) : channels.length === 0 ? (
                  <div className="w-52 px-3 py-2 text-sm text-red-400 bg-surface-elevated border border-red-500/20 rounded-lg">
                    チャンネル取得失敗
                  </div>
                ) : (
                  <select
                    value={channelValue}
                    onChange={(e) => handleChange("auto_invite_slack_channel", e.target.value)}
                    className={`w-52 px-3 py-2 text-sm rounded-lg border bg-surface-elevated text-white focus:outline-none focus:ring-2 focus:ring-brand/50 ${
                      channelChanged ? "border-amber-500/50" : "border-white/10"
                    }`}
                  >
                    <option value="" className="bg-gray-800">選択してください</option>
                    {channels.map((ch) => (
                      <option key={ch.id} value={`#${ch.name}`} className="bg-gray-800">
                        #{ch.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
