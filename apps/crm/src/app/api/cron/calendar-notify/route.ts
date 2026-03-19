import { NextResponse } from "next/server";
import { google } from "googleapis";
import { notifyCalendarEvent, logNotification, isSystemAutomationEnabled } from "@/lib/slack";
import { createServiceClient } from "@/lib/supabase/server";

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

  if (!(await isSystemAutomationEnabled("calendar-notify"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  try {
    const auth = getCalendarAuth();
    const calendar = google.calendar({ version: "v3", auth });

    const now = new Date();
    // 1〜4分後のイベントを検索（3分のcron間隔と一致、重複なし）
    // → 通知はイベント開始の1〜4分前に届く
    const timeMin = new Date(now.getTime() + 1 * 60 * 1000);
    const timeMax = new Date(now.getTime() + 4 * 60 * 1000);

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

    // ★ 重複防止: notification_logsで直近1時間以内に同じイベントIDの通知があればスキップ
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceClient() as any;
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { data: recentNotifs } = await db
      .from("notification_logs")
      .select("metadata")
      .eq("type", "calendar_event")
      .gte("created_at", oneHourAgo);

    const notifiedEventIds = new Set<string>();
    for (const n of (recentNotifs || [])) {
      const meta = n.metadata as Record<string, unknown> | null;
      if (meta?.event_id) notifiedEventIds.add(meta.event_id as string);
    }

    let notified = 0;
    let skipped = 0;

    for (const event of events) {
      const title = event.summary || "（タイトルなし）";
      // 終日イベントはスキップ（dateTimeがなくdateのみ）
      if (!event.start?.dateTime) continue;

      // ★ 開始時刻が過去のイベントはスキップ
      // Google Calendar APIはtimeMin〜timeMaxと「重なる」イベントを全て返すため、
      // 長時間イベント（深夜ブロック等）は開始時刻を過ぎても返され続ける
      const eventStart = new Date(event.start.dateTime);
      if (eventStart.getTime() < now.getTime()) {
        skipped++;
        continue;
      }

      // ★ 重複チェック（notification_logsベース）
      const eventId = event.id || `${title}_${event.start.dateTime}`;
      if (notifiedEventIds.has(eventId)) {
        skipped++;
        continue;
      }

      const startStr = event.start.dateTime;
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

      // ★ 送信記録をnotification_logsに保存（重複防止用）
      await logNotification({
        type: "calendar_event",
        message: text.slice(0, 500),
        status: "success",
        metadata: { event_id: eventId, event_title: title, event_start: startStr },
      }).catch(() => {});

      notified++;
    }

    return NextResponse.json({ success: true, notified, skipped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[calendar-notify]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
