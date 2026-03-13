import { NextResponse } from "next/server";
import { sendSlackMessage } from "@/lib/slack";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// Zapier bot ID and すもっぴ(CRM) bot ID
const ZAPIER_BOT_ID = "B03U48TH13Q";
const SUMOPPI_BOT_ID = "B0AJQTPQBSN";
const WEBHOOK_BOT_ID = "B08HMRCK341"; // incoming-webhook (LP form)

// Channels to monitor
const MONITOR_CHANNELS = [
  { id: "C07QXD9N524", name: "#sales_新規申込" },
  { id: "C06JNRZV4SZ", name: "#edu_面接報告フォーム" },
  { id: "C094YLMKR4K", name: "#sales_営業管理" },
  { id: "C094P3TMLNP", name: "#sales" },
  { id: "C094KPN4JCA", name: "#教材アウトプット" },
  { id: "C093LD0Q9AL", name: "#edu_behavior" },
  { id: "C094DA9A9B4", name: "#edu-report" },
  { id: "C08UT4BG3N1", name: "#edu_customer_success" },
  { id: "C07RL2EBPGB", name: "#marketing_youtube" },
  { id: "C095WU1JPG9", name: "#ココナラ自動連携" },
  { id: "C096RD04JQG", name: "#note購入通知" },
  { id: "C0960725T97", name: "#人材紹介オペレーション" },
  { id: "C0951QVAJ5N", name: "#ceo_report" },
];

// Report channel
const REPORT_CHANNEL = "C08LGNJMW87"; // #web_develop

interface BotMessage {
  channel: string;
  channelName: string;
  ts: string;
  botId: string;
  botName: string;
  text: string;
  datetime: string;
  customerName: string;
}

/** Extract customer/person name from message text */
function extractName(text: string): string {
  // Common patterns in both Zapier and すもっぴ messages
  const patterns = [
    /\*名前[：:]\*\s*(.+?)[\n/]/,
    /\*お名前[：:]\*\s*(.+?)[\n/]/,
    /氏名[：:]\s*(.+?)[\n]/,
    /\*名前\*[：:]\s*(.+?)[\n/]/,
    /【お名前】\s*\n(.+?)[\n]/,
    /\*お客様のお名前[：:]\*\s*(.+?)[\n]/,
    /\*お客様の名前[：:]\*\s*(.+?)[\n]/,
    /\*生徒名[：:]\*\s*(.+?)[\n]/,
    /\*顧客名[：:]\*\s*(.+?)[\n]/,
    /\*担当[：:]\*\s*(.+?)[\n]/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return "";
}

/** Normalize name for comparison (remove spaces, full-width) */
function normalizeName(name: string): string {
  return name
    .replace(/[\s　]+/g, "")
    .replace(/\u3000/g, "")
    .trim()
    .toLowerCase();
}

async function fetchChannelMessages(
  channelId: string,
  channelName: string,
  oldest: number
): Promise<BotMessage[]> {
  const messages: BotMessage[] = [];
  let cursor = "";

  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      channel: channelId,
      limit: "200",
      oldest: String(oldest),
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
    );
    const data = await res.json();
    if (!data.ok) break;

    for (const msg of data.messages || []) {
      const botId = msg.bot_id || "";
      if (![ZAPIER_BOT_ID, SUMOPPI_BOT_ID, WEBHOOK_BOT_ID].includes(botId)) continue;

      const text = msg.text || "";
      const ts = parseFloat(msg.ts || "0");
      const dt = new Date(ts * 1000);
      const jst = new Date(dt.getTime() + 9 * 3600 * 1000);

      messages.push({
        channel: channelId,
        channelName,
        ts: msg.ts,
        botId,
        botName:
          botId === ZAPIER_BOT_ID
            ? "Zapier"
            : botId === SUMOPPI_BOT_ID
              ? "すもっぴ"
              : "webhook",
        text: text.slice(0, 300),
        datetime: `${jst.getMonth() + 1}/${jst.getDate()} ${String(jst.getHours()).padStart(2, "0")}:${String(jst.getMinutes()).padStart(2, "0")}`,
        customerName: extractName(text + "\n"),
      });
    }

    const next = data.response_metadata?.next_cursor;
    if (!next) break;
    cursor = next;
  }

  return messages;
}

interface MatchResult {
  channel: string;
  zapier: BotMessage;
  sumoppi: BotMessage | null;
  status: "matched" | "zapier_only" | "sumoppi_only";
}

function matchMessages(messages: BotMessage[]): {
  matches: MatchResult[];
  zapierOnly: BotMessage[];
  sumoppiOnly: BotMessage[];
  webhookMsgs: BotMessage[];
} {
  const zapierMsgs = messages.filter((m) => m.botName === "Zapier");
  const sumoppiMsgs = messages.filter((m) => m.botName === "すもっぴ");
  const webhookMsgs = messages.filter((m) => m.botName === "webhook");

  const matches: MatchResult[] = [];
  const matchedSumoppiTs = new Set<string>();

  for (const zMsg of zapierMsgs) {
    const zName = normalizeName(zMsg.customerName);
    const zTs = parseFloat(zMsg.ts);

    // Find matching すもっぴ message: same channel, similar time (within 5 min), same name
    let bestMatch: BotMessage | null = null;
    let bestDiff = Infinity;

    for (const sMsg of sumoppiMsgs) {
      if (sMsg.channelName !== zMsg.channelName) continue;
      if (matchedSumoppiTs.has(sMsg.ts)) continue;

      const sName = normalizeName(sMsg.customerName);
      const sTs = parseFloat(sMsg.ts);
      const diff = Math.abs(zTs - sTs);

      // Match by name (if both have names) or by proximity (within 5 min)
      const nameMatch = zName && sName && zName === sName;
      const timeClose = diff < 300; // 5 minutes

      if ((nameMatch && diff < 3600) || (timeClose && (!zName || !sName))) {
        if (diff < bestDiff) {
          bestDiff = diff;
          bestMatch = sMsg;
        }
      }
    }

    if (bestMatch) {
      matchedSumoppiTs.add(bestMatch.ts);
      matches.push({
        channel: zMsg.channelName,
        zapier: zMsg,
        sumoppi: bestMatch,
        status: "matched",
      });
    }
  }

  const matchedZapierNames = new Set(
    matches.map((m) => `${m.zapier.channelName}:${normalizeName(m.zapier.customerName)}:${m.zapier.ts}`)
  );

  const zapierOnly = zapierMsgs.filter(
    (m) => !matchedZapierNames.has(`${m.channelName}:${normalizeName(m.customerName)}:${m.ts}`)
  );
  const sumoppiOnly = sumoppiMsgs.filter((m) => !matchedSumoppiTs.has(m.ts));

  return { matches, zapierOnly, sumoppiOnly, webhookMsgs };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SLACK_BOT_TOKEN) {
    return NextResponse.json({ error: "SLACK_BOT_TOKEN not set" }, { status: 500 });
  }

  try {
    // Look back 6 hours
    const sixHoursAgo = Date.now() / 1000 - 6 * 3600;

    // Collect messages from all channels
    const allMessages: BotMessage[] = [];
    for (const ch of MONITOR_CHANNELS) {
      const msgs = await fetchChannelMessages(ch.id, ch.name, sixHoursAgo);
      allMessages.push(...msgs);
    }

    // Match Zapier vs すもっぴ
    const { matches, zapierOnly, sumoppiOnly, webhookMsgs } = matchMessages(allMessages);

    const totalZapier = matches.length + zapierOnly.length;
    const totalSumoppi = matches.length + sumoppiOnly.length;

    // Build report
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 3600 * 1000);
    const timeStr = `${jstNow.getMonth() + 1}/${jstNow.getDate()} ${String(jstNow.getHours()).padStart(2, "0")}:${String(jstNow.getMinutes()).padStart(2, "0")}`;

    // Determine health status
    const isHealthy = zapierOnly.length === 0 && sumoppiOnly.length === 0;
    const hasIssues = zapierOnly.length > 0 || sumoppiOnly.length > 0;
    const icon = isHealthy
      ? totalZapier === 0
        ? "😴"  // No messages at all
        : "✅"  // All matched
      : "⚠️"; // Issues

    let report = `${icon} *Webhook ヘルスチェック* (${timeStr})\n`;
    report += `過去6時間: Zapier ${totalZapier}件 / すもっぴ ${totalSumoppi}件 / マッチ ${matches.length}件`;

    if (webhookMsgs.length > 0) {
      report += ` / LP webhook ${webhookMsgs.length}件`;
    }
    report += "\n";

    if (totalZapier === 0 && totalSumoppi === 0) {
      report += "通知なし（静かな時間帯）";
    } else if (isHealthy) {
      report += "全件マッチ 🎉 Zapier/すもっぴ完全一致\n";
      // Show matched pairs briefly
      for (const m of matches.slice(0, 5)) {
        report += `  ✓ ${m.channel} ${m.zapier.datetime} ${m.zapier.customerName || "(名前不明)"}\n`;
      }
      if (matches.length > 5) {
        report += `  ... 他${matches.length - 5}件\n`;
      }
    }

    if (zapierOnly.length > 0) {
      report += `\n🔴 *Zapierのみ（すもっぴ欠落）: ${zapierOnly.length}件*\n`;
      for (const m of zapierOnly) {
        report += `  ✗ ${m.channelName} ${m.datetime} ${m.customerName || "(名前不明)"}\n`;
        report += `    → ${m.text.slice(0, 100)}...\n`;
      }
    }

    if (sumoppiOnly.length > 0) {
      report += `\n🟡 *すもっぴのみ（Zapier欠落）: ${sumoppiOnly.length}件*\n`;
      for (const m of sumoppiOnly) {
        report += `  ◎ ${m.channelName} ${m.datetime} ${m.customerName || "(名前不明)"}\n`;
        report += `    → ${m.text.slice(0, 100)}...\n`;
      }
    }

    if (hasIssues) {
      report += "\n_不一致がある場合、webhook側の処理に問題がある可能性があります。ログを確認してください。_";
    }

    // Send report to Slack
    await sendSlackMessage(REPORT_CHANNEL, report, { username: "すもっぴ" });

    return NextResponse.json({
      success: true,
      summary: {
        period: "last_6h",
        timestamp: jstNow.toISOString(),
        zapier_total: totalZapier,
        sumoppi_total: totalSumoppi,
        matched: matches.length,
        zapier_only: zapierOnly.length,
        sumoppi_only: sumoppiOnly.length,
        webhook_msgs: webhookMsgs.length,
        healthy: isHealthy,
      },
      matches: matches.map((m) => ({
        channel: m.channel,
        name: m.zapier.customerName,
        zapier_time: m.zapier.datetime,
        sumoppi_time: m.sumoppi?.datetime,
      })),
      zapier_only: zapierOnly.map((m) => ({
        channel: m.channelName,
        name: m.customerName,
        time: m.datetime,
      })),
      sumoppi_only: sumoppiOnly.map((m) => ({
        channel: m.channelName,
        name: m.customerName,
        time: m.datetime,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[webhook-health-check]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
