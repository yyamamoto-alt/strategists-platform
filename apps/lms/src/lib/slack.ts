import "server-only";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: unknown[];
  fields?: { type: string; text: string }[];
  block_id?: string;
}

export async function sendSlackMessage(channel: string, text: string, blocks?: SlackBlock[]) {
  if (!SLACK_BOT_TOKEN) {
    console.warn("SLACK_BOT_TOKEN not set, skipping Slack notification");
    return null;
  }

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text, blocks }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("Slack API error:", data.error);
  }
  return data;
}

export async function sendInviteApprovalRequest(
  channel: string,
  application: {
    id: string;
    name: string;
    email: string;
    planName?: string | null;
  }
) {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "LMS招待承認リクエスト", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*氏名:*\n${application.name}` },
        { type: "mrkdwn", text: `*メール:*\n${application.email}` },
        { type: "mrkdwn", text: `*プラン:*\n${application.planName || "未指定"}` },
        { type: "mrkdwn", text: `*申請ID:*\n${application.id}` },
      ],
    },
    {
      type: "actions",
      block_id: `invite_approval_${application.id}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "承認して招待送信", emoji: true },
          style: "primary",
          action_id: "approve_invite",
          value: application.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "却下", emoji: true },
          style: "danger",
          action_id: "reject_invite",
          value: application.id,
        },
      ],
    },
  ];

  return sendSlackMessage(
    channel,
    `LMS招待承認リクエスト: ${application.name} (${application.email})`,
    blocks
  );
}
