import { NextResponse } from "next/server";
import { notifySalesReminder } from "@/lib/slack";

export const dynamic = "force-dynamic";

const JICOO_API_KEY = process.env.JICOO_API_KEY;
const JICOO_API_BASE = "https://api.jicoo.com/v1";

// ================================================================
// 分析ルール
// ================================================================

// 時間帯の定義（JST）
const TIME_BANDS = [
  { label: "午前(9-12時)", startHour: 9, endHour: 12 },
  { label: "午後(12-17時)", startHour: 12, endHour: 17 },
  { label: "夜間(17-21時)", startHour: 17, endHour: 21 },
] as const;

// 期間の定義
const NEAR_TERM_DAYS = 3;  // 直近3日
const TOTAL_DAYS = 7;      // 全体7日

interface Slot {
  startedAt: string;
  remainingCapacity: number;
}

interface AvailabilityAnalysis {
  eventName: string;
  duration: number;
  totalSlots: number;
  // 日別
  dailyBreakdown: { date: string; dayLabel: string; slots: number }[];
  emptyDays: string[];
  nearTermSlots: number;   // 直近3日
  farTermSlots: number;    // 4-7日目
  // 時間帯別
  timeBandBreakdown: { label: string; slots: number }[];
  concentratedBand: string | null; // 80%以上が特定時間帯に集中してる場合
  // アラート
  alerts: string[];
}

function analyzeAvailability(
  eventName: string,
  duration: number,
  slots: Slot[],
  now: Date,
): AvailabilityAnalysis {
  const alerts: string[] = [];

  // --- 日別集計 ---
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const dailyMap = new Map<string, number>();

  // 7日分の日付を初期化
  for (let d = 0; d < TOTAL_DAYS; d++) {
    const date = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const key = date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" });
    dailyMap.set(key, 0);
  }

  // 時間帯別集計
  const bandCounts: Record<string, number> = {};
  for (const band of TIME_BANDS) {
    bandCounts[band.label] = 0;
  }

  let nearTermSlots = 0;
  let farTermSlots = 0;

  for (const slot of slots) {
    const slotDate = new Date(slot.startedAt);
    const jstHour = parseInt(
      slotDate.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tokyo" }),
    );
    const dateKey = slotDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" });

    // 日別
    dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + slot.remainingCapacity);

    // 直近 vs 先
    const daysFromNow = Math.floor((slotDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysFromNow < NEAR_TERM_DAYS) {
      nearTermSlots += slot.remainingCapacity;
    } else {
      farTermSlots += slot.remainingCapacity;
    }

    // 時間帯別
    for (const band of TIME_BANDS) {
      if (jstHour >= band.startHour && jstHour < band.endHour) {
        bandCounts[band.label] += slot.remainingCapacity;
        break;
      }
    }
  }

  const totalSlots = slots.reduce((sum, s) => sum + s.remainingCapacity, 0);

  // 日別配列を構築
  const dailyBreakdown: { date: string; dayLabel: string; slots: number }[] = [];
  let dayIdx = 0;
  dailyMap.forEach((count, date) => {
    const d = new Date(now.getTime() + dayIdx * 24 * 60 * 60 * 1000);
    const dayOfWeek = dayNames[d.getDay()];
    dailyBreakdown.push({ date, dayLabel: `${date}(${dayOfWeek})`, slots: count });
    dayIdx++;
  });

  const emptyDays = dailyBreakdown.filter((d) => d.slots === 0).map((d) => d.dayLabel);

  // 時間帯配列
  const timeBandBreakdown = TIME_BANDS.map((band) => ({
    label: band.label,
    slots: bandCounts[band.label],
  }));

  // --- アラート判定 ---

  // 1. 全体量
  if (totalSlots === 0) {
    alerts.push("🔴 今後7日間の空き枠が0です");
  } else if (totalSlots <= 3) {
    alerts.push(`🟠 今後7日間の空き枠が${totalSlots}枠しかありません`);
  }

  // 2. 直近の空き
  if (totalSlots > 0 && nearTermSlots === 0) {
    alerts.push(`🔴 直近${NEAR_TERM_DAYS}日間に空き枠がありません（${NEAR_TERM_DAYS + 1}日目以降に${farTermSlots}枠）`);
  } else if (totalSlots > 3 && nearTermSlots <= 1) {
    alerts.push(`🟡 直近${NEAR_TERM_DAYS}日間の空き枠が${nearTermSlots}枠のみ`);
  }

  // 3. 逆パターン: 直近だけに偏り
  if (totalSlots > 3 && farTermSlots === 0 && nearTermSlots > 0) {
    alerts.push(`🟡 ${NEAR_TERM_DAYS + 1}日目以降に空き枠がありません（直近${NEAR_TERM_DAYS}日に${nearTermSlots}枠のみ）`);
  }

  // 4. 空白日
  // 平日(月-金)で空きがない日を検出
  const emptyWeekdays = dailyBreakdown.filter((d, i) => {
    const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dow = date.getDay();
    return dow >= 1 && dow <= 5 && d.slots === 0;
  });
  if (emptyWeekdays.length >= 2) {
    alerts.push(`🟡 平日で空きがない日: ${emptyWeekdays.map((d) => d.dayLabel).join(", ")}`);
  }

  // 5. 時間帯の偏り
  let concentratedBand: string | null = null;
  if (totalSlots >= 3) {
    for (const band of timeBandBreakdown) {
      const ratio = band.slots / totalSlots;
      if (ratio >= 0.8) {
        concentratedBand = band.label;
        alerts.push(`🟡 空き枠の${Math.round(ratio * 100)}%が${band.label}に集中しています`);
        break;
      }
    }
    // 特定時間帯が完全に0
    const emptyBands = timeBandBreakdown.filter((b) => b.slots === 0 && totalSlots > 0);
    if (emptyBands.length > 0 && !concentratedBand) {
      alerts.push(`🟡 ${emptyBands.map((b) => b.label).join("・")}の空き枠が0です`);
    }
  }

  return {
    eventName,
    duration,
    totalSlots,
    dailyBreakdown,
    emptyDays,
    nearTermSlots,
    farTermSlots,
    timeBandBreakdown,
    concentratedBand,
    alerts,
  };
}

function formatReport(analyses: AvailabilityAnalysis[]): string {
  const lines: string[] = ["📊 *Jicoo 空き枠レポート*（今後7日間）", ""];

  for (const a of analyses) {
    const hasAlert = a.alerts.length > 0;
    const icon = hasAlert ? "⚠️" : "✅";

    lines.push(`${icon} *${a.eventName}* (${a.duration}分) — 合計 *${a.totalSlots}枠*`);

    // 日別バー
    const dailyLine = a.dailyBreakdown
      .map((d) => `${d.dayLabel}:${d.slots}`)
      .join(" | ");
    lines.push(`　　📅 ${dailyLine}`);

    // 時間帯
    const bandLine = a.timeBandBreakdown
      .map((b) => `${b.label}:${b.slots}`)
      .join(" / ");
    lines.push(`　　🕐 ${bandLine}`);

    // アラート
    if (hasAlert) {
      for (const alert of a.alerts) {
        lines.push(`　　${alert}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ================================================================
// Cron Handler
// ================================================================

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!JICOO_API_KEY) {
    return NextResponse.json({ error: "JICOO_API_KEY not set" }, { status: 500 });
  }

  const headers = { Authorization: `Bearer ${JICOO_API_KEY}` };

  try {
    // 1. イベントタイプ取得
    const etRes = await fetch(`${JICOO_API_BASE}/event_types?perPage=50`, { headers });
    if (!etRes.ok) {
      return NextResponse.json({ error: `Event types: ${etRes.status}` }, { status: 500 });
    }
    const etData = await etRes.json();
    const eventTypes = ((etData?.data || []) as {
      uid: string; name: string; status: string; duration: number;
    }[]).filter((et) => et.status === "enable");

    if (eventTypes.length === 0) {
      return NextResponse.json({ success: true, message: "No active event types" });
    }

    // 2. 各イベントタイプの空き枠を分析
    const now = new Date();
    const periodStart = now.toISOString();
    const periodEnd = new Date(now.getTime() + TOTAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const analyses: AvailabilityAnalysis[] = [];

    for (const et of eventTypes) {
      try {
        const schedRes = await fetch(
          `${JICOO_API_BASE}/event_types/${et.uid}/available_schedules?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`,
          { headers },
        );
        if (!schedRes.ok) continue;
        const schedData = await schedRes.json();
        const slots = (schedData?.data || []) as Slot[];

        analyses.push(analyzeAvailability(et.name, et.duration, slots, now));
      } catch {
        // 個別エラーはスキップ
      }
    }

    // 3. レポートをSlackのsalesチャンネルに送信（アラートの有無に関わらず）
    const hasAlerts = analyses.some((a) => a.alerts.length > 0);
    const report = formatReport(analyses);
    await notifySalesReminder(report);

    return NextResponse.json({
      success: true,
      eventTypes: eventTypes.length,
      analyses: analyses.map((a) => ({
        name: a.eventName,
        totalSlots: a.totalSlots,
        nearTermSlots: a.nearTermSlots,
        farTermSlots: a.farTermSlots,
        alerts: a.alerts,
      })),
      notified: hasAlerts,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
