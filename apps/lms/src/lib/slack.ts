import "server-only";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: unknown[];
  fields?: { type: string; text: string }[];
  block_id?: string;
  label?: { type: string; text: string };
  element?: unknown;
  dispatch_action?: boolean;
  optional?: boolean;
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

// コース一覧（Slack select用）
const COURSE_OPTIONS = [
  { value: "7b46888d-fa31-4140-9780-08fd66d14023", label: "既卒コース" },
  { value: "b9cb1bab-752e-42e9-a7a4-4e3fec486b69", label: "新卒（スタンダード/ライト）" },
  { value: "719651d4-919c-485b-a3db-b2f7f4ed47a1", label: "新卒（ミニマム）" },
  { value: "92453587-9312-4a69-81ce-8698ae8ec946", label: "新卒（選コミュ）" },
  { value: "cc9b733f-44d6-4779-968d-1d961dfa024a", label: "新卒 総コンプラン" },
];

// プラン名 → コースIDのマッピング
function mapPlanToCourseIds(planName: string | null | undefined): string[] {
  if (!planName) return [];
  const lower = planName.toLowerCase();

  // 既卒系
  if (lower.includes("既卒") || lower.includes("kisotsu")) {
    return ["7b46888d-fa31-4140-9780-08fd66d14023"];
  }
  // 新卒/選コミュ
  if (lower.includes("選コミュ") || lower.includes("senkomu")) {
    return ["92453587-9312-4a69-81ce-8698ae8ec946"];
  }
  // 新卒/ミニマム
  if (lower.includes("ミニマム") || lower.includes("minimum")) {
    return ["719651d4-919c-485b-a3db-b2f7f4ed47a1"];
  }
  // 新卒/総コン
  if (lower.includes("総コン") || lower.includes("soukon")) {
    return ["cc9b733f-44d6-4779-968d-1d961dfa024a"];
  }
  // 新卒/スタンダード or ライト（デフォルト新卒）
  if (lower.includes("新卒") || lower.includes("shinsotsu") || lower.includes("スタンダード") || lower.includes("ライト")) {
    return ["b9cb1bab-752e-42e9-a7a4-4e3fec486b69"];
  }

  return [];
}

export { mapPlanToCourseIds };

export async function sendInviteApprovalRequest(
  channel: string,
  application: {
    id: string;
    name: string;
    email: string;
    planName?: string | null;
  }
) {
  const autoMappedCourseIds = mapPlanToCourseIds(application.planName);
  const autoMappedLabel = autoMappedCourseIds.length > 0
    ? COURSE_OPTIONS.filter(c => autoMappedCourseIds.includes(c.value)).map(c => c.label).join(", ")
    : "自動マッピングなし";

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "LMS招待の承認リクエスト", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*氏名:*\n${application.name}` },
        { type: "mrkdwn", text: `*メール:*\n${application.email}` },
      ],
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*申請プラン:*\n${application.planName || "未指定"}` },
        { type: "mrkdwn", text: `*自動マッピング:*\n${autoMappedLabel}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "コースを変更する場合は下のドロップダウンから選択してください。変更しない場合は自動マッピングが適用されます。" },
    },
    {
      type: "actions",
      block_id: `course_select_${application.id}`,
      elements: [
        {
          type: "static_select",
          action_id: "select_course",
          placeholder: { type: "plain_text", text: "コースを変更..." },
          options: COURSE_OPTIONS.map(c => ({
            text: { type: "plain_text", text: c.label },
            value: c.value,
          })),
          ...(autoMappedCourseIds.length > 0 ? {
            initial_option: {
              text: { type: "plain_text", text: COURSE_OPTIONS.find(c => c.value === autoMappedCourseIds[0])?.label || "" },
              value: autoMappedCourseIds[0],
            }
          } : {}),
        },
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
    `LMS招待承認リクエスト: ${application.name} (${application.email}) - プラン: ${application.planName || "未指定"}`,
    blocks
  );
}
