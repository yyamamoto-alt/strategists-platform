"use client";

import { useState, useCallback, useMemo, useEffect } from "react";

// ================================================================
// Types
// ================================================================

interface AppSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

interface SettingFieldConfig {
  key: string;
  label: string;
  type: "number" | "text" | "toggle" | "slack_channel";
  step?: string;
  min?: number;
  max?: number;
  suffix?: string;
  placeholder?: string;
}

interface SettingsSectionConfig {
  title: string;
  description: string;
  fields: SettingFieldConfig[];
}

interface Props {
  settings: AppSetting[];
}

// ================================================================
// Section Definitions
// ================================================================

const SECTIONS: SettingsSectionConfig[] = [
  {
    title: "LTV計算",
    description: "売上・LTV計算に使用されるデフォルト値を設定します。",
    fields: [
      {
        key: "default_ltv_kisotsu",
        label: "デフォルトLTV（既卒）",
        type: "number",
        suffix: "円",
        placeholder: "427636",
      },
      {
        key: "default_ltv_shinsotsu",
        label: "デフォルトLTV（新卒）",
        type: "number",
        suffix: "円",
        placeholder: "240000",
      },
      {
        key: "referral_fee_rate",
        label: "デフォルト紹介料率",
        type: "number",
        step: "0.01",
        min: 0,
        max: 1,
        placeholder: "0.3",
      },
      {
        key: "margin_rate",
        label: "デフォルトマージン率",
        type: "number",
        step: "0.01",
        min: 0,
        max: 1,
        placeholder: "0.75",
      },
    ],
  },
  {
    title: "パイプライン",
    description: "パイプラインの自動化・表示に関する設定です。",
    fields: [
      {
        key: "seiyaku_display_days",
        label: "成約ステージ表示日数",
        type: "number",
        min: 1,
        suffix: "日",
        placeholder: "14",
      },
      {
        key: "auto_lost_days",
        label: "自動失注見込移行日数",
        type: "number",
        min: 1,
        suffix: "日",
        placeholder: "14",
      },
    ],
  },
  {
    title: "Slack連携",
    description: "Slack通知の設定を管理します。通知先チャンネルを選択し、通知種別のON/OFFを設定できます。",
    fields: [
      {
        key: "slack_channel",
        label: "通知先チャンネル",
        type: "slack_channel",
        placeholder: "チャンネルを選択...",
      },
      {
        key: "slack_notify_payment_error",
        label: "決済エラー通知",
        type: "toggle",
      },
      {
        key: "slack_notify_stage_transition",
        label: "ステージ自動遷移通知",
        type: "toggle",
      },
    ],
  },
  {
    title: "表示設定",
    description: "日付・通貨などの表示フォーマットを設定します。",
    fields: [
      {
        key: "currency_locale",
        label: "通貨フォーマットロケール",
        type: "text",
        placeholder: "ja-JP",
      },
      {
        key: "date_format",
        label: "日付フォーマット",
        type: "text",
        placeholder: "yyyy/MM/dd",
      },
    ],
  },
];

// ================================================================
// Helpers
// ================================================================

function parseSettingValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  // JSONB strings come wrapped in quotes
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return ts;
  }
}

// ================================================================
// Component
// ================================================================

interface SlackChannel {
  id: string;
  name: string;
}

export function SettingsClient({ settings }: Props) {
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [slackLoading, setSlackLoading] = useState(false);

  useEffect(() => {
    setSlackLoading(true);
    fetch("/api/slack-channels")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSlackChannels(data);
      })
      .catch(() => {})
      .finally(() => setSlackLoading(false));
  }, []);

  // Build a map of key -> setting for quick lookup
  const settingMap = useMemo(() => {
    const map: Record<string, AppSetting> = {};
    for (const s of settings) {
      map[s.key] = s;
    }
    return map;
  }, [settings]);

  // Track edited values (only changed ones)
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const getCurrentValue = useCallback(
    (key: string): string => {
      if (key in editedValues) return editedValues[key];
      const setting = settingMap[key];
      if (!setting) return "";
      return parseSettingValue(setting.value);
    },
    [editedValues, settingMap]
  );

  const getOriginalValue = useCallback(
    (key: string): string => {
      const setting = settingMap[key];
      if (!setting) return "";
      return parseSettingValue(setting.value);
    },
    [settingMap]
  );

  const handleChange = useCallback(
    (key: string, value: string) => {
      const original = getOriginalValue(key);
      if (value === original) {
        // Remove from edited if reverted to original
        setEditedValues((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        setEditedValues((prev) => ({ ...prev, [key]: value }));
      }
    },
    [getOriginalValue]
  );

  const hasChanges = Object.keys(editedValues).length > 0;

  const handleSave = useCallback(async () => {
    if (!hasChanges) return;
    setSaving(true);
    setToast(null);

    // Build updates array - convert to appropriate JSONB values
    const updates = Object.entries(editedValues).map(([key, value]) => {
      const fieldConfig = SECTIONS.flatMap((s) => s.fields).find((f) => f.key === key);
      let jsonValue: unknown = value;

      if (fieldConfig?.type === "number") {
        const num = Number(value);
        jsonValue = isNaN(num) ? value : num;
      } else if (fieldConfig?.type === "toggle") {
        jsonValue = value;
      }

      return { key, value: jsonValue };
    });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "保存に失敗しました");
      }

      const result = await res.json();

      // Update the setting map with new values
      if (result.updated) {
        for (const updated of result.updated) {
          settingMap[updated.key] = updated;
        }
      }

      setEditedValues({});
      setToast({ type: "success", message: `${updates.length}件の設定を保存しました` });

      if (result.errors && result.errors.length > 0) {
        setToast({
          type: "error",
          message: `一部の設定の保存に失敗しました: ${result.errors.map((e: { key: string }) => e.key).join(", ")}`,
        });
      }
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "保存に失敗しました",
      });
    } finally {
      setSaving(false);
      // Auto-dismiss toast after 4 seconds
      setTimeout(() => setToast(null), 4000);
    }
  }, [hasChanges, editedValues, settingMap]);

  const handleReset = useCallback(() => {
    setEditedValues({});
  }, []);

  return (
    <div className="min-h-screen bg-surface-base p-6">
      {/* Header */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">設定</h1>
            <p className="text-gray-400 text-sm mt-1">
              システム全体のデフォルト値と表示設定を管理します
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm text-gray-300 bg-surface-card border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
              >
                リセット
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
                hasChanges && !saving
                  ? "bg-brand text-white hover:bg-brand/90"
                  : "bg-gray-700 text-gray-500 cursor-not-allowed"
              }`}
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg text-sm ${
              toast.type === "success"
                ? "bg-green-900/40 text-green-300 border border-green-800/50"
                : "bg-red-900/40 text-red-300 border border-red-800/50"
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Setting Sections */}
        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <div
              key={section.title}
              className="bg-surface-card border border-white/10 rounded-xl overflow-hidden"
            >
              {/* Section Header */}
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                <p className="text-sm text-gray-400 mt-0.5">{section.description}</p>
              </div>

              {/* Fields */}
              <div className="divide-y divide-white/5">
                {section.fields.map((field) => {
                  const currentValue = getCurrentValue(field.key);
                  const isChanged = field.key in editedValues;
                  const setting = settingMap[field.key];

                  return (
                    <div
                      key={field.key}
                      className="px-6 py-4 flex items-center gap-4"
                    >
                      {/* Label & Description */}
                      <div className="flex-1 min-w-0">
                        <label className="block text-sm font-medium text-gray-200">
                          {field.label}
                          {isChanged && (
                            <span className="ml-2 text-xs text-amber-400">
                              (変更あり)
                            </span>
                          )}
                        </label>
                        {setting?.description && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {setting.description}
                          </p>
                        )}
                        {setting?.updated_at && (
                          <p className="text-xs text-gray-600 mt-0.5">
                            最終更新: {formatTimestamp(setting.updated_at)}
                          </p>
                        )}
                      </div>

                      {/* Input */}
                      <div className="flex items-center gap-2">
                        {field.type === "slack_channel" ? (
                          <select
                            value={currentValue}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            className={`w-64 px-3 py-2 text-sm rounded-lg border transition-colors
                              bg-surface-elevated text-white
                              focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand
                              ${isChanged ? "border-amber-500/50" : "border-white/10"}
                            `}
                          >
                            <option value="">{slackLoading ? "読み込み中..." : "チャンネルを選択..."}</option>
                            {slackChannels.map((ch) => (
                              <option key={ch.id} value={ch.id}>#{ch.name}</option>
                            ))}
                          </select>
                        ) : field.type === "toggle" ? (
                          <button
                            type="button"
                            onClick={() => handleChange(field.key, currentValue === "true" ? "false" : "true")}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              currentValue === "true" ? "bg-brand" : "bg-gray-600"
                            } ${isChanged ? "ring-2 ring-amber-500/50" : ""}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                currentValue === "true" ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        ) : (
                          <>
                            <input
                              type={field.type}
                              value={currentValue}
                              onChange={(e) => handleChange(field.key, e.target.value)}
                              step={field.step}
                              min={field.min}
                              max={field.max}
                              placeholder={field.placeholder}
                              className={`w-48 px-3 py-2 text-sm rounded-lg border transition-colors
                                bg-surface-elevated text-white placeholder-gray-600
                                focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand
                                ${
                                  isChanged
                                    ? "border-amber-500/50"
                                    : "border-white/10"
                                }
                              `}
                            />
                            {field.suffix && (
                              <span className="text-sm text-gray-400 w-8">
                                {field.suffix}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Change Summary Footer */}
        {hasChanges && (
          <div className="mt-6 px-4 py-3 bg-surface-elevated border border-amber-500/20 rounded-lg flex items-center justify-between">
            <p className="text-sm text-amber-300">
              {Object.keys(editedValues).length}件の未保存の変更があります
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                全て取り消す
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
