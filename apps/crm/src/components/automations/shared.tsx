"use client";

import type { Automation, AutomationLog } from "@/lib/data/automations";

/* ───────── Re-export types ───────── */
export type { Automation, AutomationLog };

/* ───────── Interfaces ───────── */
export interface AutomationsClientProps {
  initialAutomations: Automation[];
  initialLogs: AutomationLog[];
}

export interface SlackChannel {
  id: string;
  name: string;
}

export interface NotificationLog {
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

export interface SystemAutomation {
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

/* ───────── Utility Functions ───────── */
export function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export function statusBadge(status: string) {
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

export function getStepCount(a: Automation): number {
  let steps = 2;
  if (a.link_to_customer) steps++;
  if (a.message_template) steps++;
  return steps;
}

/* ───────── Icon Components ───────── */
export function GoogleSheetsIcon({ className = "w-4 h-4" }: { className?: string }) {
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

export function SlackIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
      <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
      <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
    </svg>
  );
}

export function DatabaseIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

export function WebhookIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
      <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8H12" />
    </svg>
  );
}

export function ClockIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function MailIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export function StripeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#635BFF" />
      <path d="M13.976 9.15c-2.032-.894-3.015-1.31-3.015-2.116 0-.678.596-1.07 1.58-1.07 1.584 0 3.182.63 4.276 1.245l.63-3.876C16.252 2.63 14.57 2 12.624 2 9.074 2 6.5 3.982 6.5 7.038c0 4.162 5.715 4.4 5.715 6.676 0 .802-.69 1.066-1.688 1.066-1.478 0-3.506-.77-4.832-1.616L5 17.1c1.41.82 3.4 1.4 5.538 1.4 3.672 0 6.148-1.816 6.148-5.024C16.686 9.682 13.976 9.15 13.976 9.15z" fill="white"/>
    </svg>
  );
}

export function JicooIcon({ className = "w-4 h-4" }: { className?: string }) {
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

export function AppsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#FF6B35" />
      <circle cx="12" cy="12" r="6" fill="white" />
      <circle cx="12" cy="12" r="3" fill="#FF6B35" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

export function TriggerIcon({ type, className = "w-4 h-4" }: { type: string; className?: string }) {
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

export function ActionIcon({ type, className = "w-4 h-4" }: { type: string; className?: string }) {
  switch (type) {
    case "slack": return <SlackIcon className={className} />;
    case "slack_dm": return <SlackIcon className={className} />;
    case "database": return <DatabaseIcon className={className} />;
    case "mail": return <MailIcon className={className} />;
    default: return <DatabaseIcon className={className} />;
  }
}

export function CategoryBadge({ category }: { category: "cron" | "webhook" | "integration" | "user" }) {
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

/* ───────── Flow Visualizations ───────── */
export function AutomationFlow({ automation }: { automation: Automation }) {
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

export function SystemAutomationFlow({ automation }: { automation: SystemAutomation }) {
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

/* ───────── System Automations Data ───────── */
export const SYSTEM_AUTOMATIONS: SystemAutomation[] = [
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
    description: "受講期限の当日・1ヶ月前に受講者へリマインドメールを送信（初期OFF）",
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
    description: "初回指導完了時に受講者へ受講期間案内メールを送信（初期OFF）",
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
