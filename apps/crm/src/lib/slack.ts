import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

async function getSetting(key: string): Promise<string> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();
  if (!data) return "";
  const v = data.value;
  return typeof v === "string" ? v.replace(/"/g, "") : String(v ?? "");
}

export async function sendSlackMessage(channel: string, text: string) {
  if (!SLACK_BOT_TOKEN) {
    console.warn("SLACK_BOT_TOKEN not set, skipping Slack notification");
    return;
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error("Slack API error:", data.error);
    }
  } catch (e) {
    console.error("Slack notification failed:", e);
  }
}

export async function notifyPaymentError(text: string) {
  const enabled = await getSetting("slack_notify_payment_error");
  if (enabled !== "true") return;
  const channel = await getSetting("slack_channel_payment_error");
  if (!channel) return;
  await sendSlackMessage(channel, text);
}

export async function notifyStageTransition(text: string) {
  const enabled = await getSetting("slack_notify_stage_transition");
  if (enabled !== "true") return;
  const channel = await getSetting("slack_channel_stage_transition");
  if (!channel) return;
  await sendSlackMessage(channel, text);
}

// ================================================================
// Zapier移管: イベント通知（app_settings で ON/OFF・チャンネル管理）
// ================================================================

/** デフォルトチャンネル（app_settingsに未設定時のフォールバック） */
const DEFAULT_CHANNELS = {
  payment_success: "C094YLMKR4K",
  jicoo: "C07QXD9N524",
  daily_report: "C0951QVAJ5N",
} as const;

/** 通知設定を取得（enabled + channel）。未設定時はデフォルトON */
async function getNotifyConfig(type: string, defaultChannel: string) {
  const enabled = await getSetting(`slack_notify_${type}`);
  // 明示的に "false" でない限りON（初回はapp_settingsに行がないのでデフォルトON）
  if (enabled === "false") return null;
  const channel = await getSetting(`slack_channel_${type}`);
  return channel || defaultChannel;
}

/** Jicoo予約通知 */
export async function notifyJicooBooking(data: {
  event: string;
  name: string | null;
  email: string | null;
  startedAt: string | null;
  matched: boolean;
  customerUrl?: string;
}) {
  const channel = await getNotifyConfig("jicoo", DEFAULT_CHANNELS.jicoo);
  if (!channel) return;

  const emoji = data.event.includes("cancel") ? "❌" : "📅";
  const eventLabel = data.event.includes("cancel") ? "キャンセル"
    : data.event.includes("reschedule") ? "日程変更" : "新規予約";
  const dateStr = data.startedAt
    ? new Date(data.startedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    : "未定";

  const lines = [
    `${emoji} *Jicoo ${eventLabel}*`,
    `氏名: ${data.name || "不明"}`,
    `メール: ${data.email || "不明"}`,
    `日時: ${dateStr}`,
    data.matched ? "✅ 顧客マッチ済み" : "⚠️ 新規顧客として作成",
  ];
  if (data.customerUrl) lines.push(data.customerUrl);

  await sendSlackMessage(channel, lines.join("\n"));
}

/** 決済成功通知（Apps/Stripe共通） */
export async function notifyPaymentSuccess(data: {
  source: "Apps" | "Stripe";
  name: string;
  amount: number;
  product: string;
  matched: boolean;
  customerUrl?: string;
}) {
  const channel = await getNotifyConfig("payment_success", DEFAULT_CHANNELS.payment_success);
  if (!channel) return;

  const amountStr = `¥${data.amount.toLocaleString()}`;
  const lines = [
    `💰 *${data.source}決済完了*`,
    `氏名: ${data.name}`,
    `商品: ${data.product}`,
    `金額: ${amountStr}`,
    data.matched ? "✅ 顧客マッチ済み" : "⚠️ 未マッチ",
  ];
  if (data.customerUrl) lines.push(data.customerUrl);

  await sendSlackMessage(channel, lines.join("\n"));
}

/** 日次売上レポート */
export async function notifyDailyReport(text: string) {
  const channel = await getNotifyConfig("daily_report", DEFAULT_CHANNELS.daily_report);
  if (!channel) return;
  await sendSlackMessage(channel, text);
}
