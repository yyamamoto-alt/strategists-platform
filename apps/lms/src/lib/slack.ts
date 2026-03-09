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

// メンター一覧（Slack select用）
// value = メンター名（DBのmentor_name と一致させる）
const MENTOR_OPTIONS = [
  "一条", "中森", "亀井", "内野", "北川", "南野", "吉田", "喜山",
  "坂本", "坂本元", "多田", "小島", "小牧", "岡本", "岩田", "平野",
  "明石", "木村", "林田", "森野", "橘", "氷室", "河合", "片山",
  "田川", "秋山", "葉山", "西山", "西村", "赤木", "鈴木", "高橋", "鶴田",
];

// プラン名 → コースIDのマッピング
function mapPlanToCourseIds(planName: string | null | undefined): string[] {
  if (!planName) return [];
  const lower = planName.toLowerCase();

  if (lower.includes("既卒") || lower.includes("kisotsu")) {
    return ["7b46888d-fa31-4140-9780-08fd66d14023"];
  }
  if (lower.includes("選コミュ") || lower.includes("senkomu")) {
    return ["92453587-9312-4a69-81ce-8698ae8ec946"];
  }
  if (lower.includes("ミニマム") || lower.includes("minimum")) {
    return ["719651d4-919c-485b-a3db-b2f7f4ed47a1"];
  }
  if (lower.includes("総コン") || lower.includes("soukon")) {
    return ["cc9b733f-44d6-4779-968d-1d961dfa024a"];
  }
  if (lower.includes("新卒") || lower.includes("shinsotsu") || lower.includes("スタンダード") || lower.includes("ライト")) {
    return ["b9cb1bab-752e-42e9-a7a4-4e3fec486b69"];
  }

  return [];
}

export { mapPlanToCourseIds };

function formatYen(amount: number | undefined | null): string {
  if (!amount) return "¥0";
  return `¥${amount.toLocaleString()}`;
}

export interface PaymentInfo {
  contractPlan?: string;
  confirmedAmount?: number;
  billingStatus?: string;
  subsidyAmount?: number;
  payments: { date: string; amount: number; method: string }[];
  totalPaid: number;
}

export interface LearningInfo {
  totalSessions?: number;
  completedSessions?: number;
  contractMonths?: number;
  coachingStartDate?: string;
  coachingEndDate?: string;
  currentMentor?: string;
  progressSheetUrl?: string;
}

export async function sendInviteApprovalRequest(
  channel: string,
  application: {
    id: string;
    name: string;
    email: string;
    planName?: string | null;
    paymentInfo?: PaymentInfo;
    learningInfo?: LearningInfo;
  }
) {
  const autoMappedCourseIds = mapPlanToCourseIds(application.planName);
  const autoMappedLabel = autoMappedCourseIds.length > 0
    ? COURSE_OPTIONS.filter(c => autoMappedCourseIds.includes(c.value)).map(c => c.label).join(", ")
    : "自動マッピングなし";

  const pi = application.paymentInfo;
  const li = application.learningInfo;

  // 決済内訳テキスト
  let paymentDetailText = "_決済情報なし（新規顧客の可能性）_";
  if (pi && (pi.payments.length > 0 || pi.confirmedAmount)) {
    const lines: string[] = [];
    if (pi.contractPlan) lines.push(`契約プラン: ${pi.contractPlan}`);
    lines.push(`確定売上: ${formatYen(pi.confirmedAmount)}`);
    lines.push(`請求ステータス: ${pi.billingStatus || "不明"}`);
    if (pi.subsidyAmount) lines.push(`補助金: ${formatYen(pi.subsidyAmount)}`);
    lines.push(`入金済み合計: ${formatYen(pi.totalPaid)}`);
    if (pi.payments.length > 0) {
      lines.push("");
      lines.push("*直近の決済履歴:*");
      for (const p of pi.payments.slice(0, 5)) {
        lines.push(`  ${p.date}  ${formatYen(p.amount)}  (${p.method})`);
      }
      if (pi.payments.length > 5) {
        lines.push(`  ...他 ${pi.payments.length - 5} 件`);
      }
    }
    paymentDetailText = lines.join("\n");
  }

  // 指導情報テキスト
  let learningDetailText = "_指導情報なし_";
  if (li && (li.totalSessions || li.contractMonths)) {
    const lines: string[] = [];
    if (li.contractMonths) lines.push(`契約期間: ${li.contractMonths}ヶ月`);
    if (li.coachingStartDate) lines.push(`指導開始: ${li.coachingStartDate}`);
    if (li.coachingEndDate) lines.push(`指導終了: ${li.coachingEndDate}`);
    if (li.totalSessions) lines.push(`総回数: ${li.totalSessions}回（完了: ${li.completedSessions || 0}回）`);
    if (li.currentMentor) lines.push(`現担当: ${li.currentMentor}`);
    if (li.progressSheetUrl) lines.push(`<${li.progressSheetUrl}|プログレスシートを開く>`);
    learningDetailText = lines.join("\n");
  }

  // メンターの初期選択（現担当がいれば）
  const currentMentorOption = li?.currentMentor && MENTOR_OPTIONS.includes(li.currentMentor)
    ? { text: { type: "plain_text" as const, text: li.currentMentor }, value: li.currentMentor }
    : undefined;

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
        { type: "mrkdwn", text: `*コース:*\n${autoMappedLabel}` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*入金・決済情報*\n${paymentDetailText}` },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*指導情報*\n${learningDetailText}` },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*担当メンターを選択してください:*" },
    },
    {
      type: "actions",
      block_id: `mentor_select_${application.id}`,
      elements: [
        {
          type: "static_select",
          action_id: "select_mentor",
          placeholder: { type: "plain_text", text: "メンターを選択..." },
          options: MENTOR_OPTIONS.map(m => ({
            text: { type: "plain_text", text: m },
            value: m,
          })),
          ...(currentMentorOption ? { initial_option: currentMentorOption } : {}),
        },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "コースを変更する場合:" },
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

/** メンターにDMで指導依頼を送信 */
export async function sendMentorAssignmentDM(
  mentorName: string,
  studentInfo: {
    name: string;
    email: string;
    planName?: string;
    totalSessions?: number;
    contractMonths?: number;
    coachingStartDate?: string;
    coachingEndDate?: string;
    progressSheetUrl?: string;
  }
) {
  if (!SLACK_BOT_TOKEN) return null;

  // メンター名からSlackユーザーを検索（display_name or real_name でマッチ）
  const membersRes = await fetch(
    `https://slack.com/api/users.list?limit=500`,
    { headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}` } }
  );
  const membersData = await membersRes.json();

  if (!membersData.ok) {
    console.error("users.list failed:", membersData.error);
    // fallback: チャンネルにメンション付きで投稿
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mentorUser = (membersData.members || []).find((m: any) => {
    const dn = m.profile?.display_name || "";
    const rn = m.profile?.real_name || "";
    return dn.includes(mentorName) || rn.includes(mentorName);
  });

  if (!mentorUser) {
    console.warn(`Slack user not found for mentor: ${mentorName}`);
    return null;
  }

  // DMチャンネルを開く
  const openRes = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: mentorUser.id }),
  });
  const openData = await openRes.json();

  if (!openData.ok) {
    console.error("conversations.open failed:", openData.error);
    return null;
  }

  const dmChannel = openData.channel.id;
  const si = studentInfo;

  const lines = [
    `*【指導依頼】${si.name} 様*`,
    "",
    `プラン: ${si.planName || "未指定"}`,
  ];
  if (si.contractMonths) lines.push(`契約期間: ${si.contractMonths}ヶ月`);
  if (si.totalSessions) lines.push(`総指導回数: ${si.totalSessions}回`);
  if (si.coachingStartDate) lines.push(`指導開始日: ${si.coachingStartDate}`);
  if (si.coachingEndDate) lines.push(`指導終了日: ${si.coachingEndDate}`);
  lines.push(`メール: ${si.email}`);
  if (si.progressSheetUrl) {
    lines.push("");
    lines.push(`<${si.progressSheetUrl}|プログレスシートを開く>`);
  }
  lines.push("");
  lines.push("よろしくお願いいたします。");

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "新規受講生の指導依頼", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") },
    },
  ];

  return sendSlackMessage(dmChannel, `指導依頼: ${si.name} 様`, blocks);
}
