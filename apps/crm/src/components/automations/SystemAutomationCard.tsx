"use client";

import { useState } from "react";
import type { SystemAutomation, AutomationStep, ConfigParam, NotificationLog } from "./shared";
import {
  CategoryBadge, SystemAutomationFlow, ClockIcon, StepIcon,
  cronToHuman, formatDate, statusBadge,
} from "./shared";

/* ───────── Config Value Display ───────── */
function ConfigValueDisplay({ param, channelNames, override }: {
  param: ConfigParam;
  channelNames: Record<string, string>;
  override?: string | number;
}) {
  const displayValue = override ?? param.value;

  if (param.type === "slack_channel" && typeof displayValue === "string" && displayValue.startsWith("C")) {
    const name = channelNames[displayValue];
    return (
      <span className="font-mono text-xs">
        <span className="text-purple-300">#{name || "..."}</span>
        <span className="text-gray-600 ml-1">({displayValue})</span>
      </span>
    );
  }

  if (param.type === "cron" && typeof displayValue === "string") {
    return (
      <span className="text-xs">
        <span className="text-amber-300">{cronToHuman(displayValue)}</span>
        <span className="text-gray-600 ml-1 font-mono">({displayValue})</span>
      </span>
    );
  }

  if (param.type === "spreadsheet" && typeof displayValue === "string") {
    const shortId = displayValue.length > 20 ? displayValue.slice(0, 12) + "..." + displayValue.slice(-8) : displayValue;
    return (
      <a
        href={`https://docs.google.com/spreadsheets/d/${displayValue}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-green-400 hover:underline font-mono"
      >
        {shortId}
      </a>
    );
  }

  if (param.type === "url") {
    return <span className="text-xs text-cyan-400 font-mono">{String(displayValue)}</span>;
  }

  if (param.type === "number") {
    return (
      <span className="text-xs">
        <span className="text-white font-medium">{displayValue}</span>
        {param.unit && <span className="text-gray-500 ml-0.5">{param.unit}</span>}
      </span>
    );
  }

  return <span className="text-xs text-gray-300">{String(displayValue)}</span>;
}

/* ───────── Config Edit Inline ───────── */
function ConfigEditInline({ param, value, onChange, slackChannels }: {
  param: ConfigParam;
  value: string | number;
  onChange: (val: string | number) => void;
  slackChannels: { id: string; name: string }[];
}) {
  if (param.type === "slack_channel") {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs text-white w-full max-w-xs"
      >
        <option value={String(param.value)}>デフォルト</option>
        {slackChannels.map((ch) => (
          <option key={ch.id} value={ch.id}>#{ch.name} ({ch.id})</option>
        ))}
      </select>
    );
  }

  if (param.type === "number") {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs text-white w-20"
        />
        {param.unit && <span className="text-xs text-gray-500">{param.unit}</span>}
      </div>
    );
  }

  if (param.type === "text" || param.type === "spreadsheet") {
    return (
      <input
        type="text"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs text-white w-full max-w-md font-mono"
      />
    );
  }

  if (param.type === "cron") {
    return (
      <div>
        <input
          type="text"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs text-white w-40 font-mono"
        />
        {typeof value === "string" && (
          <span className="text-xs text-gray-500 ml-2">= {cronToHuman(value)}</span>
        )}
      </div>
    );
  }

  return null;
}

/* ───────── Step Detail Row ───────── */
function StepDetail({ step, stepNumber, totalSteps, isEditing, configOverrides, channelNames, slackChannels, onConfigChange }: {
  step: AutomationStep;
  stepNumber: number;
  totalSteps: number;
  isEditing: boolean;
  configOverrides: Record<string, string | number>;
  channelNames: Record<string, string>;
  slackChannels: { id: string; name: string }[];
  onConfigChange: (key: string, value: string | number) => void;
}) {
  const iconColorMap: Record<string, string> = {
    clock: "bg-amber-900/30 border-amber-800/40 text-amber-300",
    webhook: "bg-cyan-900/30 border-cyan-800/40 text-cyan-300",
    jicoo: "bg-blue-900/30 border-blue-800/40 text-blue-300",
    stripe: "bg-indigo-900/30 border-indigo-800/40 text-indigo-300",
    apps: "bg-orange-900/30 border-orange-800/40 text-orange-300",
    sheets: "bg-green-900/30 border-green-800/40 text-green-300",
    slack: "bg-purple-900/30 border-purple-800/40 text-purple-300",
    slack_dm: "bg-purple-900/30 border-purple-800/40 text-purple-300",
    database: "bg-blue-900/30 border-blue-800/40 text-blue-300",
    mail: "bg-pink-900/30 border-pink-800/40 text-pink-300",
    filter: "bg-yellow-900/30 border-yellow-800/40 text-yellow-300",
    condition: "bg-red-900/30 border-red-800/40 text-red-300",
  };

  const color = iconColorMap[step.icon] || "bg-gray-800/30 border-gray-700/40 text-gray-300";

  return (
    <div className="relative flex gap-3">
      {/* Vertical line */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${color}`}>
          <StepIcon type={step.icon} className="w-4 h-4" />
        </div>
        {stepNumber < totalSteps && (
          <div className="w-px flex-1 bg-white/10 my-1" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-gray-600 font-mono">STEP {stepNumber}</span>
          <span className="text-sm text-white font-medium">{step.label}</span>
        </div>
        <p className="text-xs text-gray-500 mb-2">{step.description}</p>

        {step.config.length > 0 && (
          <div className="bg-gray-900/50 rounded-lg border border-white/5 overflow-hidden">
            {step.config.map((param, idx) => (
              <div
                key={param.key}
                className={`flex items-start justify-between gap-4 px-3 py-2 ${
                  idx > 0 ? "border-t border-white/5" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 shrink-0">
                  <span className="text-xs text-gray-400">{param.label}</span>
                  {param.description && (
                    <span className="text-[10px] text-gray-600" title={param.description}>?</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isEditing && param.editable ? (
                    <ConfigEditInline
                      param={param}
                      value={configOverrides[param.key] ?? param.value}
                      onChange={(val) => onConfigChange(param.key, val)}
                      slackChannels={slackChannels}
                    />
                  ) : (
                    <ConfigValueDisplay
                      param={param}
                      channelNames={channelNames}
                      override={configOverrides[param.key]}
                    />
                  )}
                  {param.editable && !isEditing && (
                    <span className="text-[9px] text-gray-700 px-1 py-0.5 bg-gray-800/50 rounded">編集可</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Main Card ───────── */
export function SystemAutomationCard({ automation, isEnabled, onToggle, configOverrides, channelNames, slackChannels, onSaveConfig, logs, onRunManually, runningManually }: {
  automation: SystemAutomation;
  isEnabled: boolean;
  onToggle: () => void;
  configOverrides: Record<string, string | number>;
  channelNames: Record<string, string>;
  slackChannels: { id: string; name: string }[];
  onSaveConfig: (automationId: string, overrides: Record<string, string | number>) => Promise<void>;
  logs: NotificationLog[];
  onRunManually: (automationId: string) => Promise<void>;
  runningManually: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editOverrides, setEditOverrides] = useState<Record<string, string | number>>(configOverrides);
  const [saving, setSaving] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveConfig(automation.id, editOverrides);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditOverrides(configOverrides);
    setIsEditing(false);
  };

  const handleConfigChange = (key: string, value: string | number) => {
    setEditOverrides((prev) => ({ ...prev, [key]: value }));
  };

  // Has any editable config?
  const hasEditableConfig = automation.stepsDetail.some(s => s.config.some(c => c.editable));

  return (
    <div className={`bg-surface-raised border rounded-lg overflow-hidden transition-colors ${
      isEnabled ? "border-white/10" : "border-white/5 opacity-60"
    }`}>
      {/* Header (always visible) */}
      <div
        className="px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              {/* Expand chevron */}
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-white font-medium">{automation.name}</span>
              <CategoryBadge category={automation.category} />
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isEnabled ? "bg-green-600" : "bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    isEnabled ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <SystemAutomationFlow automation={automation} />

            <p className="text-xs text-gray-500 mt-2">
              {automation.description}
            </p>
            {automation.schedule && !expanded && (
              <p className="text-xs text-gray-600 mt-1">
                <ClockIcon className="w-3 h-3 inline mr-1" />
                {cronToHuman(automation.schedule)}
                <span className="text-gray-700 ml-1 font-mono">({automation.schedule})</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Manual run button */}
            {automation.category === "cron" && isEnabled && (
              <button
                onClick={() => onRunManually(automation.id)}
                disabled={runningManually}
                className="px-2.5 py-1.5 text-xs text-gray-400 bg-gray-800/50 rounded hover:bg-gray-700/50 hover:text-white transition-colors disabled:opacity-50"
                title="手動実行"
              >
                {runningManually ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
                    </svg>
                    実行中
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    手動実行
                  </span>
                )}
              </button>
            )}
            <span className="px-2.5 py-1.5 text-xs text-gray-500 bg-gray-800/50 rounded">
              システム管理
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Detail Panel */}
      {expanded && (
        <div className="border-t border-white/5">
          {/* Step-by-step detail */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                ステップ詳細
              </span>
              <div className="flex items-center gap-2">
                {hasEditableConfig && !isEditing && (
                  <button
                    onClick={() => { setEditOverrides(configOverrides); setIsEditing(true); }}
                    className="px-2.5 py-1 text-xs text-blue-400 bg-blue-900/20 border border-blue-800/30 rounded hover:bg-blue-900/30 transition-colors"
                  >
                    設定を編集
                  </button>
                )}
                {isEditing && (
                  <>
                    <button
                      onClick={handleCancel}
                      className="px-2.5 py-1 text-xs text-gray-400 bg-gray-800 border border-white/10 rounded hover:bg-gray-700 transition-colors"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-2.5 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {saving ? "保存中..." : "保存"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {automation.stepsDetail.map((step, idx) => (
              <StepDetail
                key={step.order}
                step={step}
                stepNumber={idx + 1}
                totalSteps={automation.stepsDetail.length}
                isEditing={isEditing}
                configOverrides={isEditing ? editOverrides : configOverrides}
                channelNames={channelNames}
                slackChannels={slackChannels}
                onConfigChange={handleConfigChange}
              />
            ))}
          </div>

          {/* API Path */}
          <div className="px-5 py-3 bg-gray-900/30 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">API Path</span>
                <code className="text-xs text-cyan-400 font-mono">{automation.apiPath}</code>
              </div>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                {showLogs ? "ログを閉じる" : "実行ログ"}
                <span className="ml-1 text-gray-700">({logs.length}件)</span>
              </button>
            </div>
          </div>

          {/* Recent Logs */}
          {showLogs && logs.length > 0 && (
            <div className="px-5 py-3 border-t border-white/5 bg-gray-900/20 max-h-48 overflow-y-auto">
              <div className="space-y-1.5">
                {logs.slice(0, 10).map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {statusBadge(log.status)}
                      <span className="text-gray-500 font-mono">{formatDate(log.created_at)}</span>
                    </div>
                    <span className="text-gray-600 truncate max-w-xs" title={log.message}>
                      {log.message.length > 60 ? log.message.slice(0, 60) + "..." : log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
