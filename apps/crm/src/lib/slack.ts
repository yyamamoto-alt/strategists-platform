import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

interface SlackSettings {
  channel: string | null;
  paymentError: boolean;
  stageTransition: boolean;
}

async function getSlackSettings(): Promise<SlackSettings> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", ["slack_channel", "slack_notify_payment_error", "slack_notify_stage_transition"]);

  const map: Record<string, unknown> = {};
  for (const row of data || []) {
    map[row.key] = typeof row.value === "string" ? row.value.replace(/"/g, "") : row.value;
  }

  return {
    channel: (map.slack_channel as string) || null,
    paymentError: String(map.slack_notify_payment_error ?? "true") === "true",
    stageTransition: String(map.slack_notify_stage_transition ?? "false") === "true",
  };
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
  const settings = await getSlackSettings();
  if (!settings.channel || !settings.paymentError) return;
  await sendSlackMessage(settings.channel, text);
}

export async function notifyStageTransition(text: string) {
  const settings = await getSlackSettings();
  if (!settings.channel || !settings.stageTransition) return;
  await sendSlackMessage(settings.channel, text);
}
