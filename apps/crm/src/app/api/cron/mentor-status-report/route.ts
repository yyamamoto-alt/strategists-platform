import { createServiceClient } from "@/lib/supabase/server";
import { sendSlackMessage, isSystemAutomationEnabled, getAutomationConfig } from "@/lib/slack";
import { fetchSheetData } from "@/lib/google-sheets";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** デフォルト通知先チャンネル (edu-report) */
const DEFAULT_CHANNEL = "C094DA9A9B4";

/** app_settings から通知設定を取得 */
async function getNotifyConfig(): Promise<string | null> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: enabledRow } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "slack_notify_mentor_status")
    .single();

  const enabled =
    enabledRow?.value != null
      ? typeof enabledRow.value === "string"
        ? enabledRow.value.replace(/"/g, "")
        : String(enabledRow.value)
      : "";

  if (enabled === "false") return null;

  const { data: channelRow } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "slack_channel_mentor_status")
    .single();

  const channel =
    channelRow?.value != null
      ? typeof channelRow.value === "string"
        ? channelRow.value.replace(/"/g, "")
        : String(channelRow.value)
      : "";

  return channel || DEFAULT_CHANNEL;
}

interface MentorStats {
  mentorId: string;
  mentorName: string;
  activeStudentCount: number;
  completedSessions30d: number;
  cancelledSessions30d: number;
  utilization?: string;       // 稼働率
  rating?: string;            // 評価
  capacity?: string;          // キャパ
  additionalRequest?: string; // 追加希望人数
}

/**
 * GET /api/cron/mentor-status-report
 * 週次メンター稼働状況レポート（毎週日曜）
 */
export async function GET(request: Request) {
  // Auth
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // System automation check
  if (!(await isSystemAutomationEnabled("mentor-status-report"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  // Notify config
  const channel = await getNotifyConfig();
  if (!channel) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "notify_disabled",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  // ------------------------------------------------------------------
  // 1. Fetch all active mentors
  // ------------------------------------------------------------------
  const { data: mentors, error: mentorsError } = await supabase
    .from("mentors")
    .select("id, name")
    .eq("is_active", true);

  if (mentorsError || !mentors) {
    return NextResponse.json(
      { error: "Failed to fetch mentors", detail: mentorsError?.message },
      { status: 500 }
    );
  }

  // ------------------------------------------------------------------
  // 2. For each mentor, fetch active student count from student_mentors
  // ------------------------------------------------------------------
  const { data: studentMentorRows } = await supabase
    .from("student_mentors")
    .select("mentor_id")
    .eq("is_active", true);

  // Count per mentor_id
  const studentCountMap = new Map<string, number>();
  if (studentMentorRows) {
    for (const row of studentMentorRows) {
      const mid = row.mentor_id as string;
      studentCountMap.set(mid, (studentCountMap.get(mid) || 0) + 1);
    }
  }

  // ------------------------------------------------------------------
  // 3. Fetch coaching sessions in last 30 days
  // ------------------------------------------------------------------
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

  const { data: sessions } = await supabase
    .from("coaching_sessions")
    .select("mentor_name, status")
    .gte("scheduled_at", thirtyDaysAgoStr);

  // Aggregate sessions by mentor_name
  const completedMap = new Map<string, number>();
  const cancelledMap = new Map<string, number>();

  if (sessions) {
    for (const s of sessions) {
      const name = (s.mentor_name as string) || "";
      if (!name) continue;
      if (s.status === "完了") {
        completedMap.set(name, (completedMap.get(name) || 0) + 1);
      } else if (s.status === "キャンセル") {
        cancelledMap.set(name, (cancelledMap.get(name) || 0) + 1);
      }
    }
  }

  // ------------------------------------------------------------------
  // 3.5. Fetch mentor data from Google Sheets (メンター管理シート)
  // ------------------------------------------------------------------
  let sheetData = new Map<string, { utilization: string; rating: string; capacity: string; additionalRequest: string }>();
  try {
    const mentorSpreadsheetId = await getAutomationConfig("sys-mentor-status-report", "spreadsheet_id", "1Kv2Sctxl_ZYRcaPSd9HjoYo2J6bu85OR1lPiDpo4HcY");
    const mentorSheetName = await getAutomationConfig("sys-mentor-status-report", "sheet_name", "メンター管理");
    const rows = await fetchSheetData(mentorSpreadsheetId, mentorSheetName);
    if (rows.length >= 2) {
      const headers = rows[0];
      const nameIdx = headers.findIndex((h: string) => h.includes("メンター") || h.includes("名前"));
      const utilIdx = headers.findIndex((h: string) => h.includes("稼働率"));
      const ratingIdx = headers.findIndex((h: string) => h.includes("評価"));
      const capIdx = headers.findIndex((h: string) => h.includes("キャパ"));
      const addIdx = headers.findIndex((h: string) => h.includes("追加希望"));

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const name = nameIdx >= 0 ? row[nameIdx]?.trim() : "";
        if (!name) continue;
        sheetData.set(name, {
          utilization: utilIdx >= 0 ? row[utilIdx] || "" : "",
          rating: ratingIdx >= 0 ? row[ratingIdx] || "" : "",
          capacity: capIdx >= 0 ? row[capIdx] || "" : "",
          additionalRequest: addIdx >= 0 ? row[addIdx] || "" : "",
        });
      }
    }
  } catch (e) {
    console.warn("Failed to fetch mentor sheet data:", e);
    // Continue without sheet data
  }

  // ------------------------------------------------------------------
  // 4. Build stats per mentor
  // ------------------------------------------------------------------
  const mentorStatsList: MentorStats[] = [];

  for (const mentor of mentors) {
    const mentorId = mentor.id as string;
    const mentorName = mentor.name as string;

    const activeStudentCount = studentCountMap.get(mentorId) || 0;
    const completedSessions30d = completedMap.get(mentorName) || 0;
    const cancelledSessions30d = cancelledMap.get(mentorName) || 0;

    // Merge sheet data if available
    const sheet = sheetData.get(mentorName);

    // Only include mentors with active students OR recent sessions
    if (activeStudentCount > 0 || completedSessions30d > 0 || cancelledSessions30d > 0) {
      mentorStatsList.push({
        mentorId,
        mentorName,
        activeStudentCount,
        completedSessions30d,
        cancelledSessions30d,
        utilization: sheet?.utilization,
        rating: sheet?.rating,
        capacity: sheet?.capacity,
        additionalRequest: sheet?.additionalRequest,
      });
    }
  }

  // Sort by active student count descending
  mentorStatsList.sort((a, b) => b.activeStudentCount - a.activeStudentCount);

  // ------------------------------------------------------------------
  // 5. Format Slack message
  // ------------------------------------------------------------------
  const lines: string[] = ["【メンター稼働状況】", ""];

  if (mentorStatsList.length === 0) {
    lines.push("現在アクティブなメンターはいません。");
  } else {
    for (const m of mentorStatsList) {
      lines.push(`${m.mentorName}メンター　指導中: ${m.activeStudentCount}名`);
      lines.push(
        `　　セッション(30日): 完了${m.completedSessions30d}回 / キャンセル${m.cancelledSessions30d}回`
      );
      // スプレッドシートからの追加情報（ハート色分け: 評価に応じたアイコン）
      const sheetParts: string[] = [];
      if (m.utilization) sheetParts.push(`稼働率: ${m.utilization}`);
      if (m.rating) {
        const ratingNum = parseFloat(m.rating);
        let heart = "💛"; // デフォルト
        if (!isNaN(ratingNum)) {
          if (ratingNum >= 4.5) heart = "💚";      // 高評価
          else if (ratingNum >= 4.0) heart = "💛";  // 良好
          else if (ratingNum >= 3.0) heart = "🧡";  // 普通
          else heart = "❤️";                        // 要改善
        }
        sheetParts.push(`${heart} 評価: ${m.rating}`);
      }
      if (m.capacity) sheetParts.push(`キャパ: ${m.capacity}名`);
      if (m.additionalRequest) sheetParts.push(`追加希望: ${m.additionalRequest}名`);
      if (sheetParts.length > 0) {
        lines.push(`　　${sheetParts.join(" / ")}`);
      }
    }
  }

  // ------------------------------------------------------------------
  // 6. Send to Slack
  // ------------------------------------------------------------------
  await sendSlackMessage(channel, lines.join("\n"));

  return NextResponse.json({
    ok: true,
    mentorCount: mentorStatsList.length,
    timestamp: new Date().toISOString(),
  });
}
