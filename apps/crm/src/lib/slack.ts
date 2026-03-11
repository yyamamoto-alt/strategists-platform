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

export async function sendSlackMessage(channel: string, text: string, options?: { username?: string }): Promise<boolean> {
  if (!SLACK_BOT_TOKEN) {
    console.error("[sendSlackMessage] SLACK_BOT_TOKEN not set — notification NOT sent");
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = { channel, text };
    if (options?.username) {
      body.username = options.username;
    }
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error(`[sendSlackMessage] Slack API error (channel=${channel}):`, data.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[sendSlackMessage] Failed (channel=${channel}):`, e);
    return false;
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
  attribute?: string;
  utmSource?: string;
  utmMedium?: string;
  hostName?: string;
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
  ];
  if (data.attribute) lines.push(`属性: ${data.attribute}`);
  lines.push(`メール: ${data.email || "不明"}`);
  lines.push(`日時: ${dateStr}`);
  if (data.hostName) lines.push(`担当者: ${data.hostName}`);
  if (data.utmSource) lines.push(`流入元: ${data.utmSource}${data.utmMedium ? ` / ${data.utmMedium}` : ""}`);
  lines.push(data.matched ? "✅ 顧客マッチ済み" : "⚠️ 新規顧客として作成");
  if (data.customerUrl) lines.push(data.customerUrl);

  await sendSlackMessage(channel, lines.join("\n"));
}

/** アセスメント予約通知 */
export async function notifyAssessmentBooking(text: string) {
  const channel = await getNotifyConfig("assessment_booking", "C09GWR7RC8G");
  if (!channel) return;
  await sendSlackMessage(channel, text);
}

/** ビヘイビア予約通知 */
export async function notifyBehaviorBooking(text: string) {
  const channel = await getNotifyConfig("behavior_booking", "C093LD0Q9AL");
  if (!channel) return;
  await sendSlackMessage(channel, text);
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
  discountedFrom?: number;
  installmentInfo?: string;
}) {
  const channel = await getNotifyConfig("payment_success", DEFAULT_CHANNELS.payment_success);
  if (!channel) return;

  const amountStr = `${data.amount.toLocaleString()}円`;
  const lines = [
    `🎉 *成約おめでとうございます！* 🎉`,
    `*決済完了のお知らせ*`,
    `*名前:* ${data.name}`,
    `*商品:* ${data.product}`,
    `*金額:* ${amountStr}`,
  ];
  if (data.discountedFrom && data.discountedFrom > data.amount) {
    lines.push(`*割引前金額:* ${data.discountedFrom.toLocaleString()}円`);
  }
  if (data.installmentInfo) {
    lines.push(`*分割:* ${data.installmentInfo}`);
  }
  // メール・カード情報があれば追加（マッチや特定の手がかりになる）
  if (data.email) lines.push(`*メール:* ${data.email}`);
  if (data.cardInfo) lines.push(`*カード:* ${data.cardInfo}`);
  lines.push(data.matched ? "✅ 顧客マッチ済み" : "⚠️ 未マッチ");
  if (data.customerUrl) lines.push(data.customerUrl);

  await sendSlackMessage(channel, lines.join("\n"), {
    username: "営業勝ち取ったbot",
  });
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

/** Slack DMを送信（user IDを指定） - 失敗時はエラーをthrow */
export async function sendSlackDM(userId: string, text: string) {
  if (!SLACK_BOT_TOKEN) {
    throw new Error("SLACK_BOT_TOKEN not set");
  }

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
    throw new Error(`conversations.open failed: ${openData.error}`);
  }

  const dmChannelId = openData.channel.id;

  // chat.postMessage でDM送信
  const msgRes = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: dmChannelId, text }),
  });
  const msgData = await msgRes.json();
  if (!msgData.ok) {
    throw new Error(`chat.postMessage failed: ${msgData.error}`);
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

/** 入塾フォーム受信通知 — プラン・エージェント利用の確認リクエスト（salesチャンネル + 担当者メンション） */
export async function notifyEnrollmentFormReceived(data: {
  customerName: string;
  customerId: string;
  planName: string | null;
  agentUsage: string | null;
  subsidyEligible: boolean;
  salesPerson: string | null;
}) {
  const channel = await getNotifyConfig("enrollment_confirmation", "C094YLMKR4K"); // #sales_営業管理
  if (!channel) return;

  // 営業担当者のSlack IDを取得してメンション
  let mention = "";
  if (data.salesPerson) {
    const mapping = await getStaffSlackMapping();
    const slackId = findSlackUserId(data.salesPerson, mapping);
    if (slackId) {
      mention = `<@${slackId}> `;
    } else {
      mention = `@${data.salesPerson} `;
    }
  }

  const crmUrl = `https://strategists-crm.vercel.app/customers/${data.customerId}`;
  const lines = [
    `${mention}📋 *入塾フォーム受信 — 確認リクエスト*`,
    `受講生: ${data.customerName}`,
    `申込プラン: ${data.planName || "未入力"}`,
    `エージェント利用: ${data.agentUsage || "未入力"}`,
    data.subsidyEligible ? "✅ 補助金対象（自動判定）" : "",
    ``,
    `⚠️ *お客様入力のため、プランとエージェント利用が正しいかご確認ください*`,
    crmUrl,
  ].filter(Boolean);

  await sendSlackMessage(channel, lines.join("\n"));
}

/** note購入通知（Zapier準拠: チャンネル C096RD04JQG） */
export async function notifyNotePurchase(data: {
  product: string;
  price: number;
  buyer: string;
  isArticle: boolean;
}) {
  const channel = await getNotifyConfig("note_purchase", "C096RD04JQG");
  if (!channel) return;
  // Zapier準拠: "{product}({price}) by "{buyer}""
  const text = `${data.product}(${data.price}) by "${data.buyer}"`;
  if (!SLACK_BOT_TOKEN) return;
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text,
        username: data.isArticle ? "note(記事)販売通知" : "note(マガジン)販売通知",
        icon_emoji: data.isArticle ? ":green_book:" : ":closed_book:",
      }),
    });
  } catch (e) {
    console.error("Note purchase notification failed:", e);
  }
}

/** カルテ記入通知（Zapier移管: #biz-dev — 名前/年齢/経歴/志望/プログレスシートURL） */
export async function notifyKarteSubmission(data: {
  name: string;
  attribute?: string;
  age?: number | null;
  xAccount?: string;
  careerHistory?: string;
  targetCompanies?: string;
  caseStatus?: string;
  interviewLevel?: string;
  transferIntent?: string;
  desiredStartDate?: string;
  utmSource?: string;
  progressSheetUrl?: string;
  customerId?: string;
}) {
  const channel = await getNotifyConfig("karte_submission", "C07QXD9N524"); // #biz-dev
  if (!channel) return;

  const lines = [
    `*名前：* ${data.name}/${data.attribute || ""}`,
    data.age != null ? `*年齢：* ${data.age}歳` : "",
    data.xAccount ? `*Xアカウント:* https://x.com/${data.xAccount}` : "",
    data.careerHistory ? `*ご経歴：* ${data.careerHistory.substring(0, 200)}` : "",
    data.targetCompanies ? `*志望ファーム：* ${data.targetCompanies}` : "",
    data.caseStatus ? `*ケース面接対策の状況：* ${data.caseStatus}${data.interviewLevel ? `/${data.interviewLevel}` : ""}` : "",
    data.transferIntent ? `*意向:* ${data.transferIntent}` : "",
    data.desiredStartDate ? `*入社希望日:* ${data.desiredStartDate}` : "",
    data.utmSource ? `*知ったきっかけ:* ${data.utmSource}` : "",
    data.progressSheetUrl ? `*Progress Sheet:* ${data.progressSheetUrl}` : "",
    data.customerId ? `https://strategists-crm.vercel.app/customers/${data.customerId}` : "",
  ].filter(Boolean);

  await sendSlackMessage(channel, lines.join("\n"), {
    username: "新規顧客情報",
  });
}

/** YouTube経由申込通知（Zapier移管: #youtube） */
export async function notifyYouTubeReferral(data: {
  name: string;
  attribute?: string;
  careerHistory?: string;
  prefecture?: string;
  originalMessageUrl?: string;
  customerId?: string;
}) {
  const channel = await getNotifyConfig("youtube_report", "C07RL2EBPGB"); // #youtube
  if (!channel) return;

  const lines = [
    `*youtube経由の申し込みが入りました*`,
    `${data.name}${data.attribute ? `/${data.attribute}` : ""}`,
    data.careerHistory ? data.careerHistory.substring(0, 150) : "",
    data.prefecture || "",
    data.customerId ? `https://strategists-crm.vercel.app/customers/${data.customerId}` : "",
  ].filter(Boolean);

  await sendSlackMessage(channel, lines.join("\n"), {
    username: "お祝いbot",
  });
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

/** 補助金顧客の入塾フォーム提出時に荒井さんへ通知 */
export async function notifySubsidyEnrollment(data: {
  customerName: string;
  customerId: string;
  hasIdentityDoc: boolean;
  hasBankDoc: boolean;
  identityDocUrl: string | null;
  bankDocUrl: string | null;
}) {
  // 荒井さんのSlack ID（app_settingsのstaff_slack_mappingから取得、またはフォールバック）
  const mapping = await getStaffSlackMapping();
  const araiSlackId = mapping["荒井"];

  if (!araiSlackId) {
    console.error("[notifySubsidyEnrollment] 荒井さんのSlack IDが見つかりません。staff_slack_mappingに追加してください。");
    // チャンネルにフォールバック
    const channel = await getNotifyConfig("subsidy_enrollment", DEFAULT_CHANNELS.payment_success);
    if (!channel) return;

    const crmUrl = `https://strategists-crm.vercel.app/customers/${data.customerId}`;
    const lines = [
      `📋 *【補助金】入塾フォーム受信 — 確認TODO*`,
      `受講生: ${data.customerName}`,
      ``,
      `*確認事項:*`,
      `${data.hasIdentityDoc ? "✅" : "❌"} 本人確認書類が正しく保存されているか（画像の不備確認）`,
      `${data.hasBankDoc ? "✅" : "❌"} 振込先確認書類が正しく保存されているか（画像の不備確認）`,
      `⬜ 契約書が締結されているか`,
      ``,
      crmUrl,
    ];
    await sendSlackMessage(channel, lines.join("\n"));
    return;
  }

  const crmUrl = `https://strategists-crm.vercel.app/customers/${data.customerId}`;
  const lines = [
    `📋 *【補助金】入塾フォーム受信 — 確認TODO*`,
    `受講生: ${data.customerName}`,
    ``,
    `*確認事項:*`,
    `${data.hasIdentityDoc ? "✅" : "❌"} 本人確認書類が正しく保存されているか（画像の不備確認）`,
    data.hasIdentityDoc && data.identityDocUrl ? `  └ ${data.identityDocUrl.split(",")[0].trim()}` : "",
    `${data.hasBankDoc ? "✅" : "❌"} 振込先確認書類が正しく保存されているか（画像の不備確認）`,
    data.hasBankDoc && data.bankDocUrl ? `  └ ${data.bankDocUrl.split(",")[0].trim()}` : "",
    `⬜ 契約書が締結されているか`,
    ``,
    crmUrl,
  ].filter(Boolean);

  try {
    await sendSlackDM(araiSlackId, lines.join("\n"));
  } catch (e) {
    console.error("[notifySubsidyEnrollment] DM failed, falling back to channel:", e);
    const channel = await getNotifyConfig("subsidy_enrollment", DEFAULT_CHANNELS.payment_success);
    if (channel) {
      await sendSlackMessage(channel, `<@${araiSlackId}> ` + lines.join("\n"));
    }
  }
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
