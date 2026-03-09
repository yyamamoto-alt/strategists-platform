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
  email?: string;
  cardInfo?: string;
}) {
  const channel = await getNotifyConfig("payment_success", DEFAULT_CHANNELS.payment_success);
  if (!channel) return;

  const amountStr = `¥${data.amount.toLocaleString()}`;
  const lines = [
    `🎉 *成約おめでとうございます！* 🎉`,
    `*決済完了のお知らせ*`,
    `名前: ${data.name}`,
    `商品: ${data.product}`,
    `金額: ${amountStr}`,
  ];
  // メール・カード情報があれば追加（マッチや特定の手がかりになる）
  if (data.email) lines.push(`メール: ${data.email}`);
  if (data.cardInfo) lines.push(`カード: ${data.cardInfo}`);
  lines.push(data.matched ? "✅ 顧客マッチ済み" : "⚠️ 未マッチ");
  if (data.customerUrl) lines.push(data.customerUrl);

  await sendSlackMessage(channel, lines.join("\n"));
}

/** 日次売上レポート */
export async function notifyDailyReport(text: string) {
  const channel = await getNotifyConfig("daily_report", DEFAULT_CHANNELS.daily_report);
  if (!channel) return;
  await sendSlackMessage(channel, text);
}

// ================================================================
// Slack DM送信
// ================================================================

/** Slack DMを送信（user IDを指定） */
export async function sendSlackDM(userId: string, text: string) {
  if (!SLACK_BOT_TOKEN) {
    console.warn("SLACK_BOT_TOKEN not set, skipping Slack DM");
    return;
  }

  try {
    // conversations.open でDMチャンネルを開く
    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ users: userId }),
    });
    const openData = await openRes.json();
    if (!openData.ok) {
      console.error("Slack conversations.open error:", openData.error);
      return;
    }

    const dmChannelId = openData.channel.id;
    await sendSlackMessage(dmChannelId, text);
  } catch (e) {
    console.error("Slack DM failed:", e);
  }
}

// ================================================================
// Staff Slack ID マッピング
// ================================================================

/** app_settings の staff_slack_mapping から営業スタッフ名 → Slack User ID を取得 */
export async function getStaffSlackMapping(): Promise<Record<string, string>> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("app_settings")
    .select("value")
    .eq("key", "staff_slack_mapping")
    .single();

  if (!data?.value) return {};
  if (typeof data.value === "object") return data.value as Record<string, string>;
  try {
    return JSON.parse(String(data.value));
  } catch {
    return {};
  }
}

/** 営業スタッフ名からSlack User IDを引く（部分一致対応） */
export function findSlackUserId(
  name: string | null,
  mapping: Record<string, string>
): string | null {
  if (!name) return null;
  // 完全一致
  if (mapping[name]) return mapping[name];
  // 苗字一致（"山本 太郎" → "山本"）
  const surname = name.split(/[\s　]/)[0];
  if (surname && mapping[surname]) return mapping[surname];
  return null;
}

// ================================================================
// 通知ログ記録
// ================================================================

/** notification_logsテーブルにログを記録 */
export async function logNotification(data: {
  type: string;
  channel?: string;
  recipient?: string;
  customer_id?: string;
  message: string;
  status: "success" | "failed";
  error_message?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("notification_logs").insert({
      type: data.type,
      channel: data.channel || null,
      recipient: data.recipient || null,
      customer_id: data.customer_id || null,
      message: data.message.substring(0, 2000),
      status: data.status,
      error_message: data.error_message || null,
      metadata: data.metadata || null,
    });
  } catch (e) {
    console.error("Failed to log notification:", e);
  }
}

/** 営業リマインド通知 */
export async function notifySalesReminder(text: string) {
  const channel = await getNotifyConfig("sales_reminder", DEFAULT_CHANNELS.payment_success);
  if (!channel) return;
  await sendSlackMessage(channel, text);
}

/** Jicoo空き枠レポート通知 */
export async function notifyJicooAvailability(text: string) {
  const channel = await getNotifyConfig("jicoo_availability", DEFAULT_CHANNELS.payment_success);
  if (!channel) return;
  await sendSlackMessage(channel, text);
}

// ================================================================
// システム自動化 ON/OFF チェック
// ================================================================

/** システム自動化が有効かチェック（デフォルトON） */
export async function isSystemAutomationEnabled(automationId: string): Promise<boolean> {
  const value = await getSetting(`sys_automation_${automationId}`);
  // 明示的に "false" でない限りON
  return value !== "false";
}
