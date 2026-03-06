import "server-only";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export async function sendSlackNotification(text: string, blocks?: unknown[]) {
  if (!SLACK_WEBHOOK_URL) return;

  try {
    const body: Record<string, unknown> = { text };
    if (blocks) body.blocks = blocks;

    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("Slack notification failed:", e);
  }
}
