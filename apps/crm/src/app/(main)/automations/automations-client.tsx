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

interface NotificationLog {
  id: string;
  type: string;
  channel: string | null;
  recipient: string | null;
  customer_id: string | null;
  message: string;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
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

function WebhookIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
      <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8H12" />
    </svg>
  );
}

function ClockIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MailIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function StripeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#635BFF" />
      <path d="M13.976 9.15c-2.032-.894-3.015-1.31-3.015-2.116 0-.678.596-1.07 1.58-1.07 1.584 0 3.182.63 4.276 1.245l.63-3.876C16.252 2.63 14.57 2 12.624 2 9.074 2 6.5 3.982 6.5 7.038c0 4.162 5.715 4.4 5.715 6.676 0 .802-.69 1.066-1.688 1.066-1.478 0-3.506-.77-4.832-1.616L5 17.1c1.41.82 3.4 1.4 5.538 1.4 3.672 0 6.148-1.816 6.148-5.024C16.686 9.682 13.976 9.15 13.976 9.15z" fill="white"/>
    </svg>
  );
}

function JicooIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#4A90D9" />
      <rect x="5" y="3" width="14" height="18" rx="2" fill="white" />
      <line x1="5" y1="8" x2="19" y2="8" stroke="#4A90D9" strokeWidth="1" />
      <rect x="8" y="10" width="3" height="3" rx="0.5" fill="#4A90D9" />
      <rect x="13" y="10" width="3" height="3" rx="0.5" fill="#4A90D9" opacity="0.5" />
      <rect x="8" y="15" width="3" height="3" rx="0.5" fill="#4A90D9" opacity="0.5" />
    </svg>
  );
}

function AppsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#FF6B35" />
      <circle cx="12" cy="12" r="6" fill="white" />
      <circle cx="12" cy="12" r="3" fill="#FF6B35" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

// ================================================================
// システム自動化（ハードコードの定義）
// ================================================================

interface SystemAutomation {
  id: string;
  name: string;
  description: string;
  category: "cron" | "webhook" | "integration";
  trigger: { icon: "clock" | "webhook" | "jicoo" | "stripe" | "apps" | "sheets"; label: string };
  actions: { icon: "slack" | "database" | "mail" | "slack_dm"; label: string }[];
  schedule?: string;
  isActive: boolean;
  steps: number;
}

const SYSTEM_AUTOMATIONS: SystemAutomation[] = [
  // === Cron Jobs ===
  {
    id: "sys-daily-report",
    name: "日次売上レポート",
    description: "毎朝、当月売上・ファネル・人材紹介サマリーをSlack配信",
    category: "cron",
    trigger: { icon: "clock", label: "毎日 0:00 (UTC)" },
    actions: [
      { icon: "database", label: "売上集計" },
      { icon: "slack", label: "Slack通知" },
    ],
    schedule: "0 0 * * *",
    isActive: true,
    steps: 3,
  },
  {
    id: "sys-stage-transitions",
    name: "ステージ自動遷移",
    description: "1ヶ月未対応の案件を自動で「実施不可」「失注見込(自動)」に移行",
    category: "cron",
    trigger: { icon: "clock", label: "毎日 0:00 (UTC)" },
    actions: [
      { icon: "database", label: "ステージ更新" },
      { icon: "slack", label: "Slack通知" },
    ],
    schedule: "0 0 * * *",
    isActive: true,
    steps: 3,
  },
  {
    id: "sys-sales-reminder",
    name: "営業リマインド",
    description: "連絡予定日の当日DM、5日未対応でエスカレーション、14日で自動失注",
    category: "cron",
    trigger: { icon: "clock", label: "毎日 0:00 (UTC)" },
    actions: [
      { icon: "slack_dm", label: "担当者DM" },
      { icon: "slack", label: "チャンネル通知" },
      { icon: "database", label: "自動失注" },
    ],
    schedule: "0 0 * * *",
    isActive: true,
    steps: 4,
  },
  {
    id: "sys-mentor-reminder",
    name: "メンターリマインド",
    description: "指導期間終了30日前と最終日にメンターへDM通知",
    category: "cron",
    trigger: { icon: "clock", label: "毎日 0:00 (UTC)" },
    actions: [
      { icon: "slack_dm", label: "メンターDM" },
    ],
    schedule: "0 0 * * *",
    isActive: true,
    steps: 2,
  },
  {
    id: "sys-sync-spreadsheets",
    name: "スプレッドシート同期",
    description: "Google Sheetsの新規行を5分ごとに検知し、顧客DBに反映+Slack通知",
    category: "cron",
    trigger: { icon: "clock", label: "5分ごと" },
    actions: [
      { icon: "database", label: "顧客DB更新" },
      { icon: "slack", label: "Slack通知" },
    ],
    schedule: "*/5 * * * *",
    isActive: true,
    steps: 3,
  },
  // === Webhooks ===
  {
    id: "sys-webhook-jicoo",
    name: "Jicoo予約連携",
    description: "予約作成/変更/キャンセル時に顧客マッチング+パイプライン更新+Slack通知",
    category: "webhook",
    trigger: { icon: "jicoo", label: "予約イベント" },
    actions: [
      { icon: "database", label: "顧客マッチ" },
      { icon: "database", label: "パイプライン更新" },
      { icon: "slack", label: "Slack通知" },
    ],
    isActive: true,
    steps: 4,
  },
  {
    id: "sys-webhook-apps",
    name: "Apps決済連携",
    description: "決済完了時にOrder作成+顧客マッチング+Slack通知（エラー通知含む）",
    category: "webhook",
    trigger: { icon: "apps", label: "決済イベント" },
    actions: [
      { icon: "database", label: "Order作成" },
      { icon: "database", label: "顧客マッチ" },
      { icon: "slack", label: "Slack通知" },
    ],
    isActive: true,
    steps: 4,
  },
  {
    id: "sys-webhook-stripe",
    name: "Stripe決済連携",
    description: "charge.succeeded時にOrder作成+顧客マッチング+Slack通知",
    category: "webhook",
    trigger: { icon: "stripe", label: "決済成功" },
    actions: [
      { icon: "database", label: "Order作成" },
      { icon: "database", label: "顧客マッチ" },
      { icon: "slack", label: "Slack通知" },
    ],
    isActive: true,
    steps: 4,
  },
  {
    id: "sys-weekly-sales-report",
    name: "週次営業レポート",
    description: "毎週月曜に営業KPI（新規申込・面談・成約・担当者別実績）をSlack配信",
    category: "cron",
    trigger: { icon: "clock", label: "毎週月曜 1:00 (UTC)" },
    actions: [
      { icon: "database", label: "KPI集計" },
      { icon: "slack", label: "Slack通知" },
    ],
    schedule: "0 1 * * 1",
    isActive: true,
    steps: 3,
  },
  {
    id: "sys-ca-reminder",
    name: "CAリマインド",
    description: "毎朝、キャリアアドバイザーに担当顧客のフォローアップリマインドをDM送信",
    category: "cron",
    trigger: { icon: "clock", label: "毎日 0:00 (UTC)" },
    actions: [
      { icon: "slack_dm", label: "CA DM" },
      { icon: "slack", label: "サマリー通知" },
    ],
    schedule: "0 0 * * *",
    isActive: true,
    steps: 3,
  },
  {
    id: "sys-payment-confirm",
    name: "報酬支払い確認",
    description: "毎月14日にスタッフへSlack DMで個別の報酬支払い明細を送付",
    category: "cron",
    trigger: { icon: "clock", label: "毎月14日 4:00 (UTC)" },
    actions: [
      { icon: "slack_dm", label: "個別DM（支払明細）" },
      { icon: "slack", label: "経営report（サマリー）" },
    ],
    schedule: "0 4 14 * *",
    isActive: true,
    steps: 3,
  },
  {
    id: "sys-work-status-report",
    name: "勤務状況レポート",
    description: "毎週日曜に勤怠DBスプレッドシートから稼働時間を集計し、先週比・月平均比付きでSlack配信",
    category: "cron",
    trigger: { icon: "clock", label: "毎週日曜 0:15 (UTC)" },
    actions: [
      { icon: "database", label: "勤怠DB取得" },
      { icon: "slack", label: "レポート配信" },
    ],
    schedule: "15 0 * * 0",
    isActive: true,
    steps: 3,
  },
  {
    id: "sys-assessment-booking",
    name: "ビヘイビア/アセスメント予約通知",
    description: "Jicoo予約時にビヘイビア・アセスメントを検出し、専用チャンネルに通知",
    category: "webhook",
    trigger: { icon: "jicoo", label: "予約イベント" },
    actions: [
      { icon: "slack", label: "専用ch通知" },
    ],
    isActive: true,
    steps: 2,
  },
  {
    id: "sys-coaching-consumption-alert",
    name: "指導消化率アラート",
    description: "毎月1日に日程消化率と指導消化率の差分が25%以上の受講生をピックアップしSlack通知",
    category: "cron",
    trigger: { icon: "clock", label: "毎月1日 0:00 (UTC)" },
    actions: [
      { icon: "database", label: "消化率計算" },
      { icon: "slack", label: "edu-report" },
    ],
    schedule: "0 0 1 * *",
    isActive: true,
    steps: 3,
  },
  {
    id: "sys-mentor-status-report",
    name: "メンター稼働状況レポート",
    description: "毎週日曜にメンターごとの指導人数・セッション実績をSlack配信",
    category: "cron",
    trigger: { icon: "clock", label: "毎週日曜 0:30 (UTC)" },
    actions: [
      { icon: "database", label: "稼働集計" },
      { icon: "slack", label: "edu-report" },
    ],
    schedule: "30 0 * * 0",
    isActive: true,
    steps: 3,
  },
  {
    id: "sys-student-reminder",
    name: "受講者リマインドメール",
    description: "受講期限の当日・1ヶ月前に受講者へリマインドメールを送信（⚠️初期OFF）",
    category: "cron",
    trigger: { icon: "clock", label: "毎日 0:00 (UTC)" },
    actions: [
      { icon: "database", label: "期限チェック" },
      { icon: "mail", label: "メール送信" },
    ],
    schedule: "0 0 * * *",
    isActive: true,
    steps: 3,
  },
  {
    id: "sys-coaching-start-notification",
    name: "受講開始日リマインドメール",
    description: "初回指導完了時に受講者へ受講期間案内メールを送信（⚠️初期OFF）",
    category: "cron",
    trigger: { icon: "clock", label: "毎日 0:00 (UTC)" },
    actions: [
      { icon: "database", label: "初回指導検知" },
      { icon: "mail", label: "メール送信" },
    ],
    schedule: "0 0 * * *",
    isActive: true,
    steps: 3,
  },
];

// ================================================================
// ステップ数計算（ユーザー定義）
// ================================================================

function getStepCount(a: Automation): number {
  let steps = 2;
  if (a.link_to_customer) steps++;
  if (a.message_template) steps++;
  return steps;
}

// ================================================================
// トリガーアイコンレンダリング
// ================================================================

function TriggerIcon({ type, className = "w-4 h-4" }: { type: string; className?: string }) {
  switch (type) {
    case "clock": return <ClockIcon className={className} />;
    case "webhook": return <WebhookIcon className={className} />;
    case "jicoo": return <JicooIcon className={className} />;
    case "stripe": return <StripeIcon className={className} />;
    case "apps": return <AppsIcon className={className} />;
    case "sheets": return <GoogleSheetsIcon className={className} />;
    default: return <WebhookIcon className={className} />;
  }
}

function ActionIcon({ type, className = "w-4 h-4" }: { type: string; className?: string }) {
  switch (type) {
    case "slack": return <SlackIcon className={className} />;
    case "slack_dm": return <SlackIcon className={className} />;
    case "database": return <DatabaseIcon className={className} />;
    case "mail": return <MailIcon className={className} />;
    default: return <DatabaseIcon className={className} />;
  }
}

// ================================================================
// フロー可視化（ユーザー定義）
// ================================================================

function AutomationFlow({ automation }: { automation: Automation }) {
  const steps = getStepCount(automation);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex items-center gap-1 px-2 py-1 bg-green-900/20 border border-green-800/30 rounded text-xs text-green-300">
        <GoogleSheetsIcon className="w-3.5 h-3.5" />
        <span>新規行</span>
      </div>
      <ArrowIcon />
      <div className="flex items-center gap-1 px-2 py-1 bg-purple-900/20 border border-purple-800/30 rounded text-xs text-purple-300">
        <SlackIcon className="w-3.5 h-3.5" />
        <span>通知</span>
      </div>
      {automation.link_to_customer && (
        <>
          <span className="text-gray-600">+</span>
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-900/20 border border-blue-800/30 rounded text-xs text-blue-300">
            <DatabaseIcon className="w-3.5 h-3.5" />
            <span>DB更新</span>
          </div>
        </>
      )}
      <span className="ml-1.5 px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-800 rounded">
        {steps}ステップ
      </span>
    </div>
  );
}

// ================================================================
// システム自動化フロー可視化
// ================================================================

function SystemAutomationFlow({ automation }: { automation: SystemAutomation }) {
  const triggerColor = automation.category === "cron"
    ? "bg-amber-900/20 border-amber-800/30 text-amber-300"
    : "bg-cyan-900/20 border-cyan-800/30 text-cyan-300";

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className={`flex items-center gap-1 px-2 py-1 border rounded text-xs ${triggerColor}`}>
        <TriggerIcon type={automation.trigger.icon} className="w-3.5 h-3.5" />
        <span>{automation.trigger.label}</span>
      </div>
      {automation.actions.map((action, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <ArrowIcon />
          <div className={`flex items-center gap-1 px-2 py-1 border rounded text-xs ${
            action.icon === "slack" || action.icon === "slack_dm"
              ? "bg-purple-900/20 border-purple-800/30 text-purple-300"
              : action.icon === "mail"
              ? "bg-pink-900/20 border-pink-800/30 text-pink-300"
              : "bg-blue-900/20 border-blue-800/30 text-blue-300"
          }`}>
            <ActionIcon type={action.icon} className="w-3.5 h-3.5" />
            <span>{action.label}</span>
          </div>
        </div>
      ))}
      <span className="ml-1.5 px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-800 rounded">
        {automation.steps}ステップ
      </span>
    </div>
  );
}

// ================================================================
// カテゴリバッジ
// ================================================================

function CategoryBadge({ category }: { category: "cron" | "webhook" | "integration" | "user" }) {
  const styles = {
    cron: "bg-amber-900/30 text-amber-300 border-amber-800/30",
    webhook: "bg-cyan-900/30 text-cyan-300 border-cyan-800/30",
    integration: "bg-green-900/30 text-green-300 border-green-800/30",
    user: "bg-indigo-900/30 text-indigo-300 border-indigo-800/30",
  };
  const labels = {
    cron: "定時実行",
    webhook: "Webhook",
    integration: "連携",
    user: "カスタム",
  };

  return (
    <span className={`px-2 py-0.5 text-[10px] font-medium border rounded ${styles[category]}`}>
      {labels[category]}
    </span>
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
  const [activeTab, setActiveTab] = useState<"all" | "cron" | "webhook" | "user" | "logs" | "reminders">("all");

  // システム自動化 ON/OFF 状態
  const [systemStates, setSystemStates] = useState<Record<string, boolean>>({});
  const [systemStatesLoading, setSystemStatesLoading] = useState(false);

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

  // システム自動化の状態を取得
  useEffect(() => {
    setSystemStatesLoading(true);
    fetch("/api/system-automations")
      .then(r => r.json())
      .then(data => setSystemStates(data))
      .catch(() => {})
      .finally(() => setSystemStatesLoading(false));
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

// ================================================================
// SystemAutomationCard（システム自動化カード）
// ================================================================

function SystemAutomationCard({ automation, isEnabled, onToggle }: { automation: SystemAutomation; isEnabled: boolean; onToggle: () => void }) {
  return (
    <div className={`bg-surface-raised border rounded-lg overflow-hidden transition-colors ${
      isEnabled ? "border-white/10" : "border-white/5 opacity-60"
    }`}>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-white font-medium">{automation.name}</span>
              <CategoryBadge category={automation.category} />
              <button
                onClick={onToggle}
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
            {automation.schedule && (
              <p className="text-xs text-gray-600 mt-1">
                <ClockIcon className="w-3 h-3 inline mr-1" />
                スケジュール: {automation.schedule}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1.5 text-xs text-gray-500 bg-gray-800/50 rounded">
              システム管理
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// AutomationCard（ユーザー定義カード）
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

// ================================================================
// 通知ログパネル
// ================================================================

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

function NotificationLogsPanel({
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

// ================================================================
// リマインドパネル
// ================================================================

function RemindersPanel({
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
                  {salesReminders.map((r) => (
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
                  {mentorReminders.map((r) => {
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
