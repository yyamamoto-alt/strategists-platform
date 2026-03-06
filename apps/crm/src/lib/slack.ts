import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

async function getSlackSettings(): Promise<{
  webhookUrl: string | null;
  paymentError: boolean;
  stageTransition: boolean;
}> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", ["slack_webhook_url", "slack_notify_payment_error", "slack_notify_stage_transition"]);

  const map: Record<string, unknown> = {};
  for (const row of data || []) {
    map[row.key] = row.value;
  }

  const url = (map.slack_webhook_url as string) || process.env.SLACK_WEBHOOK_URL || "";

  return {
    webhookUrl: url && url.startsWith("https://") ? url : null,
    paymentError: String(map.slack_notify_payment_error ?? "true") === "true",
    stageTransition: String(map.slack_notify_stage_transition ?? "false") === "true",
  };
}

async function sendToWebhook(url: string, text: string) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("Slack notification failed:", e);
  }
}

export async function notifyPaymentError(text: string) {
  const settings = await getSlackSettings();
  if (!settings.webhookUrl || !settings.paymentError) return;
  await sendToWebhook(settings.webhookUrl, text);
}

export async function notifyStageTransition(text: string) {
  const settings = await getSlackSettings();
  if (!settings.webhookUrl || !settings.stageTransition) return;
  await sendToWebhook(settings.webhookUrl, text);
}
