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

async function sendSlackMessage(channel: string, text: string) {
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
