import { fetchSheetData } from "@/lib/google-sheets";
import { sendSlackMessage, isSystemAutomationEnabled, getAutomationConfig } from "@/lib/slack";
import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_SPREADSHEET_ID = "1bxvZ0fZNgSKV9fSW6vvhEcLcILCduAA1gYD4irX2SDI";
const DEFAULT_SHEET_NAME = "report用";
const DEFAULT_CHANNEL = "C0951QVAJ5N";

// ================================================================
// Date / Hours parsing utilities (ported from Zapier Python code)
// ================================================================

/** Full-width digit → half-width */
function normalizeDigits(s: string): string {
  return s.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

/** Parse date string or Excel serial number → Date (JST midnight) */
function parseDate(raw: string): Date | null {
  if (!raw || !raw.trim()) return null;
  const s = normalizeDigits(raw.trim());

  // Excel serial number (20000–100000 range)
  const num = Number(s);
  if (!isNaN(num) && num >= 20000 && num <= 100000) {
    // Excel epoch: 1899-12-30
    const ms = (num - 25569) * 86400000; // 25569 = days from 1899-12-30 to 1970-01-01
    const d = new Date(ms);
    // Shift to JST midnight
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    );
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }

  return null;
}

/** Parse hours value → decimal hours */
function parseHours(raw: string): number {
  if (!raw || !raw.trim()) return 0;
  const s = normalizeDigits(raw.trim());

  // H:MM format (e.g. "3:30")
  const hm = s.match(/^(\d+):(\d+)$/);
  if (hm) {
    return Number(hm[1]) + Number(hm[2]) / 60;
  }

  // Xh or X時間 format
  const hMatch = s.match(/^([\d.]+)\s*[hH時](?:間)?$/);
  if (hMatch) return Number(hMatch[1]);

  // Xm or X分 format
  const mMatch = s.match(/^([\d.]+)\s*[mM分]$/);
  if (mMatch) return Number(mMatch[1]) / 60;

  // plain decimal
  const n = Number(s);
  if (!isNaN(n)) return n;

  return 0;
}

/** Normalize name: strip leading @, split on （or ( */
function normalizeName(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("@")) s = s.slice(1);
  s = s.split(/[（(]/)[0].trim();
  return s;
}

// ================================================================
// Week boundary helpers (JST, Monday–Sunday)
// ================================================================

/** Get JST "today" as a Date at UTC midnight representing JST date */
function jstToday(): Date {
  const now = new Date();
  // JST = UTC+9
  const jst = new Date(now.getTime() + 9 * 3600000);
  return new Date(
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate())
  );
}

/** Get Monday of the week containing the given date (Mon=1..Sun=7) */
function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

/** Add days to a UTC-midnight date */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

// ================================================================
// Notify config (same pattern as other crons)
// ================================================================

async function getNotifyConfig(): Promise<string | null> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: enabledRow } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "slack_notify_work_status")
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
    .eq("key", "slack_channel_work_status")
    .single();
  const channel =
    channelRow?.value != null
      ? typeof channelRow.value === "string"
        ? channelRow.value.replace(/"/g, "")
        : String(channelRow.value)
      : "";

  return channel || DEFAULT_CHANNEL;
}

// ================================================================
// Capacity emoji
// ================================================================

function capacityEmoji(cap: string): string {
  const s = cap.trim().replace(/%/, "");
  const n = Number(s);
  if (isNaN(n)) return "";
  if (n === 100) return "  \u263A\uFE0F"; // ☺️
  if (n === 75 || n === 50 || n === 125 || n === 150) return "  \u26A0\uFE0F"; // ⚠️
  return "";
}

// ================================================================
// Main
// ================================================================

interface PersonWeek {
  hours: number;
}

/**
 * GET /api/cron/work-status-report
 * 週次稼働レポート（毎週日曜）
 */
export async function GET(request: Request) {
  // Auth
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // System automation check
  if (!(await isSystemAutomationEnabled("work-status-report"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  // Notify config
  const channel = await getNotifyConfig();
  if (!channel) {
    return NextResponse.json({ ok: true, skipped: true, reason: "notify_disabled" });
  }

  // 設定オーバーライド
  const SPREADSHEET_ID = await getAutomationConfig("sys-work-status-report", "spreadsheet_id", DEFAULT_SPREADSHEET_ID);
  const SHEET_NAME = await getAutomationConfig("sys-work-status-report", "sheet_name", DEFAULT_SHEET_NAME);

  // ------------------------------------------------------------------
  // 1. Fetch spreadsheet data (skip header row)
  // ------------------------------------------------------------------
  const rows = await fetchSheetData(SPREADSHEET_ID, SHEET_NAME, 2);
  // fetchSheetData with startRow=2 returns [headerRow, ...dataRows]
  const dataRows = rows.slice(1);

  // ------------------------------------------------------------------
  // 2. Parse rows into records
  // ------------------------------------------------------------------
  interface RawRecord {
    date: Date;
    name: string;
    hours: number;
    capacity: string;
  }

  const records: RawRecord[] = [];
  for (const row of dataRows) {
    const dateRaw = row[0] || "";
    const nameRaw = row[1] || "";
    const hoursRaw = row[2] || "";
    const capacityRaw = row[3] || "";

    const date = parseDate(dateRaw);
    if (!date) continue;
    const name = normalizeName(nameRaw);
    if (!name) continue;
    const hours = parseHours(hoursRaw);

    records.push({ date, name, hours, capacity: capacityRaw.trim() });
  }

  // ------------------------------------------------------------------
  // 3. Determine target week (LAST week: Mon–Sun before current week)
  // ------------------------------------------------------------------
  const today = jstToday();
  const thisMonday = mondayOf(today);
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(lastMonday, 6);

  // Previous week (2 weeks ago) for week-over-week comparison
  const prevMonday = addDays(lastMonday, -7);
  const prevSunday = addDays(prevMonday, 6);

  // 30-day window ending on lastSunday
  const thirtyDaysAgo = addDays(lastSunday, -29);

  // ------------------------------------------------------------------
  // 4. Aggregate per person
  // ------------------------------------------------------------------
  // Collect all unique names and their latest capacity from target week
  const capacityMap = new Map<string, string>();

  // Helper: is date in range [start, end] inclusive (UTC dates)
  function inRange(d: Date, start: Date, end: Date): boolean {
    return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  }

  // Per-person aggregation
  const targetWeekHours = new Map<string, number>();
  const prevWeekHours = new Map<string, number>();
  const last30DaysHours = new Map<string, number>();

  for (const r of records) {
    // Target week
    if (inRange(r.date, lastMonday, lastSunday)) {
      targetWeekHours.set(r.name, (targetWeekHours.get(r.name) || 0) + r.hours);
      if (r.capacity) capacityMap.set(r.name, r.capacity);
    }

    // Previous week
    if (inRange(r.date, prevMonday, prevSunday)) {
      prevWeekHours.set(r.name, (prevWeekHours.get(r.name) || 0) + r.hours);
    }

    // 30-day window
    if (inRange(r.date, thirtyDaysAgo, lastSunday)) {
      last30DaysHours.set(r.name, (last30DaysHours.get(r.name) || 0) + r.hours);
    }
  }

  // ------------------------------------------------------------------
  // 5. Build per-person results (only people with >0 hours in target week)
  // ------------------------------------------------------------------
  interface PersonResult {
    name: string;
    hours: number;
    weekDiff: number;
    avgDiff: number;
    capacity: string;
  }

  const results: PersonResult[] = [];
  const twEntries = Array.from(targetWeekHours.entries()) as [string, number][];
  for (const entry of twEntries) {
    const pName = entry[0];
    const hours = entry[1];
    if (hours <= 0) continue;

    const prevHours = prevWeekHours.get(pName) || 0;
    const weekDiff = hours - prevHours;

    // 30-day average / 4 (approximate weekly average over last 30 days)
    const thirtyTotal = last30DaysHours.get(pName) || 0;
    const weeklyAvg = thirtyTotal / 4;
    const avgDiff = hours - weeklyAvg;

    results.push({
      name: pName,
      hours,
      weekDiff,
      avgDiff,
      capacity: capacityMap.get(pName) || "",
    });
  }

  // Sort by hours descending
  results.sort((a, b) => b.hours - a.hours);

  // ------------------------------------------------------------------
  // 6. Team totals
  // ------------------------------------------------------------------
  const teamTotal = results.reduce((sum, r) => sum + r.hours, 0);
  const teamPrevTotal = Array.from(prevWeekHours.values()).reduce((s, v) => s + v, 0);
  const teamWeekDiff = teamTotal - teamPrevTotal;

  // Team 30-day avg/4
  const team30Total = Array.from(last30DaysHours.values()).reduce((s, v) => s + v, 0);
  const teamAvgDiff = teamTotal - team30Total / 4;

  // ------------------------------------------------------------------
  // 7. Format Slack message
  // ------------------------------------------------------------------
  function fmtMD(d: Date): string {
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  function fmtDiff(n: number): string {
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}h`;
  }

  const lines: string[] = [
    `\uD83D\uDCCA 稼働レポート（${fmtMD(lastMonday)}〜${fmtMD(lastSunday)}）`,
    "",
  ];

  for (const r of results) {
    const emoji = capacityEmoji(r.capacity);
    lines.push(
      `*${r.name}*: ${r.hours.toFixed(1)}h（先週比 ${fmtDiff(r.weekDiff)} / 1ヶ月Avg/4比 ${fmtDiff(r.avgDiff)}）${emoji}`
    );
  }

  lines.push("");
  lines.push(
    `合計: ${teamTotal.toFixed(1)}h（先週比 ${fmtDiff(teamWeekDiff)} / 1ヶ月Avg/4比 ${fmtDiff(teamAvgDiff)}）`
  );

  // ------------------------------------------------------------------
  // 8. Send to Slack
  // ------------------------------------------------------------------
  await sendSlackMessage(channel, lines.join("\n"));

  return NextResponse.json({
    ok: true,
    week: `${fmtMD(lastMonday)}〜${fmtMD(lastSunday)}`,
    people: results.length,
    totalHours: teamTotal,
    timestamp: new Date().toISOString(),
  });
}
