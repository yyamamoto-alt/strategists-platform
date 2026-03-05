"use client";

import { useState, useEffect, useCallback } from "react";

interface Setting {
  key: string;
  value: unknown;
  description: string | null;
}

const SETTINGS_CONFIG = [
  {
    key: "auto_invite_enabled",
    label: "自動招待を有効にする",
    description: "入塾フォーム受付時にSlack承認→自動でLMS招待メールを送信します",
    type: "toggle" as const,
  },
  {
    key: "auto_invite_slack_channel",
    label: "Slack通知チャンネル",
    description: "承認リクエストを送信するSlackチャンネル名（例: #lms-invites）",
    type: "text" as const,
    placeholder: "#lms-invites",
  },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
  }, []);

  const handleChange = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const hasChanges = SETTINGS_CONFIG.some((c) => settings[c.key] !== original[c.key]);

  const handleSave = async () => {
    setSaving(true);
    setToast(null);

    const updates = SETTINGS_CONFIG
      .filter((c) => settings[c.key] !== original[c.key])
      .map((c) => ({ key: c.key, value: settings[c.key] }));

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
            {SETTINGS_CONFIG.map((config) => {
              const value = settings[config.key] || "";
              const isChanged = value !== (original[config.key] || "");

              return (
                <div key={config.key} className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium text-gray-200">
                      {config.label}
                      {isChanged && (
                        <span className="ml-2 text-xs text-amber-400">(変更あり)</span>
                      )}
                    </label>
                    <p className="text-xs text-gray-500 mt-0.5">{config.description}</p>
                  </div>
                  <div>
                    {config.type === "toggle" ? (
                      <button
                        type="button"
                        onClick={() => handleChange(config.key, value === "true" ? "false" : "true")}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          value === "true" ? "bg-brand" : "bg-gray-600"
                        } ${isChanged ? "ring-2 ring-amber-500/50" : ""}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            value === "true" ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    ) : (
                      <input
                        type="text"
                        value={value.replace(/"/g, "")}
                        onChange={(e) => handleChange(config.key, e.target.value)}
                        placeholder={config.placeholder}
                        className={`w-48 px-3 py-2 text-sm rounded-lg border bg-surface-elevated text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand/50 ${
                          isChanged ? "border-amber-500/50" : "border-white/10"
                        }`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 p-4 bg-surface-elevated border border-white/10 rounded-xl">
          <h3 className="text-sm font-medium text-gray-300 mb-2">必要な環境変数</h3>
          <div className="space-y-1 text-xs text-gray-500">
            <p>RESEND_API_KEY — メール送信（設定済み）</p>
            <p>SLACK_BOT_TOKEN — Slack通知送信（設定済み）</p>
            <p>SLACK_SIGNING_SECRET — Slack承認ボタン署名検証（設定済み）</p>
          </div>
        </div>
      </div>
    </div>
  );
}
