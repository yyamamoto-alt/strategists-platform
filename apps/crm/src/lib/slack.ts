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
// Zapier移管: イベント通知
// ================================================================

/** Zapier移管チャンネルマッピング（zapfile.json由来） */
const CHANNELS = {
  /** 営業/決済/リマインド全般 */
  sales: "C094YLMKR4K",
  /** Jicoo予約・営業フォーム通知 */
  jicoo: "C07QXD9N524",
  /** 入塾フォーム */
  enrollment: "C0AAZMEH37E",
  /** 売上レポート（毎日） */
  report: "C0951QVAJ5N",
} as const;

/** Jicoo予約通知 */
export async function notifyJicooBooking(data: {
  event: string;
  name: string | null;
  email: string | null;
  startedAt: string | null;
  matched: boolean;
  customerUrl?: string;
}) {
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

  await sendSlackMessage(CHANNELS.jicoo, lines.join("\n"));
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
  const amountStr = `¥${data.amount.toLocaleString()}`;
  const lines = [
    `💰 *${data.source}決済完了*`,
    `氏名: ${data.name}`,
    `商品: ${data.product}`,
    `金額: ${amountStr}`,
    data.matched ? "✅ 顧客マッチ済み" : "⚠️ 未マッチ",
  ];
  if (data.customerUrl) lines.push(data.customerUrl);

  await sendSlackMessage(CHANNELS.sales, lines.join("\n"));
}

/** 営業フォーム同期通知 */
export async function notifyFormSync(data: {
  sourceName: string;
  customerName: string;
  action: "created" | "updated" | "unmatched";
  customerId?: string;
  extraFields?: Record<string, string>;
}) {
  const emoji = data.action === "created" ? "🆕"
    : data.action === "updated" ? "📝" : "⚠️";
  const actionLabel = data.action === "created" ? "新規作成"
    : data.action === "updated" ? "更新" : "未マッチ";

  const channel = data.sourceName === "入塾フォーム" ? CHANNELS.enrollment : CHANNELS.jicoo;

  const lines = [
    `${emoji} *${data.sourceName}* — ${actionLabel}`,
    `氏名: ${data.customerName}`,
  ];

  if (data.extraFields) {
    for (const [k, v] of Object.entries(data.extraFields)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }

  if (data.customerId) {
    lines.push(`https://strategists-crm.vercel.app/customers/${data.customerId}`);
  }

  await sendSlackMessage(channel, lines.join("\n"));
}

/** 日次売上レポート */
export async function notifyDailyReport(text: string) {
  await sendSlackMessage(CHANNELS.report, text);
}
