import { NextResponse } from "next/server";
import { google } from "googleapis";
import { notifyCalendarEvent } from "@/lib/slack";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 5分ごとに実行: Googleカレンダーから直近3〜8分以内に始まるイベントを取得し
 * #予定通知 チャンネルにSlack通知を送る。
 *
 * Zapier「予定通知」の移植。
 */

const CALENDAR_ID = "theroad.and.bluesky@gmail.com";
const MENTION_USER = "<@U03TF7YESK1>";

/** HTMLタグを除去してプレーンテキストにする */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "・")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function getCalendarAuth() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable");
  }
  const credentials = JSON.parse(credentialsJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const auth = getCalendarAuth();
    const calendar = google.calendar({ version: "v3", auth });

    const now = new Date();
    // 3分後〜8分後のイベントを検索（5分のcron間隔と一致、重複なし）
    const timeMin = new Date(now.getTime() + 3 * 60 * 1000);
    const timeMax = new Date(now.getTime() + 8 * 60 * 1000);

    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = res.data.items || [];

    if (events.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    let notified = 0;

    for (const event of events) {
      const title = event.summary || "（タイトルなし）";
      const startStr = event.start?.dateTime || event.start?.date;
      if (!startStr) continue;

      const startDate = new Date(startStr);
      const timeStr = startDate.toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // 会議URL: hangoutLink > location(URLの場合)
      const meetUrl = event.hangoutLink
        || (event.location?.startsWith("http") ? event.location : null);
      const locationText = event.location && !event.location.startsWith("http")
        ? `📍 ${event.location}`
        : "";
      const descText = event.description
        ? `📝 ${stripHtml(event.description).substring(0, 200)}`
        : "";

      const lines = [
        `🔔 まもなく予定があります ${MENTION_USER}`,
        `*${title}*`,
        `🕐 ${timeStr}`,
      ];
      if (meetUrl) lines.push(`🔗 ${meetUrl}`);
      if (locationText) lines.push(locationText);
      if (descText) lines.push(descText);

      const text = lines.join("\n");

      await notifyCalendarEvent(text);
      notified++;
    }

    return NextResponse.json({ success: true, notified });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[calendar-notify]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
