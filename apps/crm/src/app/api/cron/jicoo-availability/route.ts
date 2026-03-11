import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyJicooAvailability } from "@/lib/slack";

export const dynamic = "force-dynamic";

const JICOO_API_KEY = process.env.JICOO_API_KEY;
const JICOO_API_BASE = "https://api.jicoo.com/v1";

// デフォルト値（app_settingsに未設定の場合）
const DEFAULTS = {
  total_days: 15,
  near_threshold: 4,
  total_threshold: 15,
  mid_threshold: 3,
  far_threshold: 3,
  evening_threshold: 6,
  target_events: "【中途】転職相談/ケース指導体験,【新卒】無料初回メンタリング_28卒",
  target_event_uids: "o072r8CvwVF4,_zDLK66WrbIT",
};

interface Slot {
  startedAt: string;
  remainingCapacity: number;
}

interface Thresholds {
  nearThreshold: number;
  totalThreshold: number;
  midThreshold: number;
  farThreshold: number;
  eveningThreshold: number;
}

async function loadSettings() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from("app_settings")
    .select("key, value")
    .like("key", "jicoo_availability_%");

  const map: Record<string, string> = {};
  if (data) {
    for (const row of data as { key: string; value: unknown }[]) {
      const v = row.value;
      map[row.key] = typeof v === "string" ? v.replace(/"/g, "") : String(v ?? "");
    }
  }

  const num = (key: string, def: number) => {
    const v = map[`jicoo_availability_${key}`];
    if (!v) return def;
    const n = Number(v);
    return isNaN(n) ? def : n;
  };

  return {
    totalDays: num("total_days", DEFAULTS.total_days),
    thresholds: {
      nearThreshold: num("near_threshold", DEFAULTS.near_threshold),
      totalThreshold: num("total_threshold", DEFAULTS.total_threshold),
      midThreshold: num("mid_threshold", DEFAULTS.mid_threshold),
      farThreshold: num("far_threshold", DEFAULTS.far_threshold),
      eveningThreshold: num("evening_threshold", DEFAULTS.evening_threshold),
    } as Thresholds,
    targetEventUids: (map["jicoo_availability_target_event_uids"] || DEFAULTS.target_event_uids)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    targetEventNames: (map["jicoo_availability_target_events"] || DEFAULTS.target_events)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function analyzeAllSlots(allSlots: Slot[], now: Date, totalDays: number, t: Thresholds) {
  const alerts: string[] = [];
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

  // 日別初期化
  const dailyMap = new Map<string, number>();
  for (let d = 0; d < totalDays; d++) {
    const date = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const key = date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" });
    dailyMap.set(key, 0);
  }

  let nearSlots = 0;
  let midSlots = 0;
  let farSlots = 0;
  let eveningWeekendSlots = 0;

  for (const slot of allSlots) {
    const slotDate = new Date(slot.startedAt);
    const jstHour = parseInt(
      slotDate.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tokyo" }),
    );
    const dateKey = slotDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" });
    const jstDate = new Date(slotDate.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const dow = jstDate.getDay();

    dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + slot.remainingCapacity);

    const daysFromNow = Math.floor((slotDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysFromNow < 5) nearSlots += slot.remainingCapacity;
    if (daysFromNow >= 3 && daysFromNow < 10) midSlots += slot.remainingCapacity;
    if (daysFromNow >= 9) farSlots += slot.remainingCapacity;

    const isWeekend = dow === 0 || dow === 6;
    const isEveningWeekday = dow >= 1 && dow <= 5 && jstHour >= 19;
    if (isWeekend || isEveningWeekday) {
      eveningWeekendSlots += slot.remainingCapacity;
    }
  }

  const totalSlots = allSlots.reduce((sum, s) => sum + s.remainingCapacity, 0);

  const dailyBreakdown: { dayLabel: string; slots: number }[] = [];
  let dayIdx = 0;
  dailyMap.forEach((count, date) => {
    const d = new Date(now.getTime() + dayIdx * 24 * 60 * 60 * 1000);
    const dayOfWeek = dayNames[d.getDay()];
    dailyBreakdown.push({ dayLabel: `${date}(${dayOfWeek})`, slots: count });
    dayIdx++;
  });

  // --- アラート判定 ---
  if (totalSlots <= t.totalThreshold) {
    alerts.push(`🔴 全体の空き枠が${totalSlots}枠（${t.totalThreshold}枠以下）→ 全体的に枠が不足しています`);
  }
  if (nearSlots <= t.nearThreshold) {
    alerts.push(`🟠 今後5日間の空き枠が${nearSlots}枠（${t.nearThreshold}枠以下）→ 直近の予約を受けられません`);
  }
  if (midSlots < t.midThreshold) {
    alerts.push(`🟡 4〜10日目の空き枠が${midSlots}枠（${t.midThreshold}枠未満）→ 中期の枠確保が必要です`);
  }
  if (farSlots < t.farThreshold) {
    alerts.push(`🟡 10日目以降の空き枠が${farSlots}枠（${t.farThreshold}枠未満）→ 先の日程の枠を追加してください`);
  }
  if (eveningWeekendSlots <= t.eveningThreshold) {
    alerts.push(`🟡 平日夜(19時〜)+土日の空き枠が${eveningWeekendSlots}枠（${t.eveningThreshold}枠以下）→ 社会人が予約しづらい状況です`);
  }

  return { totalSlots, nearSlots, midSlots, farSlots, eveningWeekendSlots, dailyBreakdown, alerts };
}

function formatReport(analysis: ReturnType<typeof analyzeAllSlots>, eventTypeName: string): string {
  const { totalSlots, nearSlots, midSlots, farSlots, eveningWeekendSlots, dailyBreakdown, alerts } = analysis;
  const hasAlert = alerts.length > 0;
  const icon = hasAlert ? "⚠️" : "✅";

  const lines: string[] = [
    `${icon} *Jicoo 空き枠レポート — ${eventTypeName}* — 合計 *${totalSlots}枠*`,
    "",
    `📊 *期間別*`,
    `　今後5日: *${nearSlots}枠* ｜ 4〜10日目: *${midSlots}枠* ｜ 10日目〜: *${farSlots}枠*`,
    `　平日夜+土日: *${eveningWeekendSlots}枠*`,
    "",
  ];

  lines.push("📅 *日別内訳*");
  for (let i = 0; i < dailyBreakdown.length; i += 5) {
    const chunk = dailyBreakdown.slice(i, i + 5);
    lines.push(`　${chunk.map((d) => `${d.dayLabel}:*${d.slots}*`).join("  ")}`);
  }
  lines.push("");

  if (hasAlert) {
    lines.push("*⚠️ 注意点:*");
    for (const alert of alerts) {
      lines.push(`　${alert}`);
    }
  } else {
    lines.push("✅ 十分な空き枠が確保されています");
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

  // app_settingsから設定を読み込み
  const config = await loadSettings();
  const headers = { "X-Jicoo-Api-Key": JICOO_API_KEY };

  try {
    // 1. 対象イベントタイプを設定から取得（UIDベースで直接利用）
    // event_types API は権限制約で403になるため、設定済みUIDを直接使用する
    const eventTypes = config.targetEventUids.map((uid) => {
      // targetEventNamesが設定されていれば対応する名前を使用、なければUID表示
      const nameIndex = config.targetEventUids.indexOf(uid);
      const name = config.targetEventNames[nameIndex] || `イベント(${uid})`;
      return { uid, name };
    });

    if (eventTypes.length === 0) {
      return NextResponse.json({ success: true, message: "No target event UIDs configured" });
    }

    // 2. 予約ページごとに個別に分析・通知
    const now = new Date();
    const periods: [string, string][] = [];

    for (let d = 0; d < config.totalDays; d += 7) {
      const start = new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString();
      const endDay = Math.min(d + 7, config.totalDays);
      const end = new Date(now.getTime() + endDay * 24 * 60 * 60 * 1000).toISOString();
      periods.push([start, end]);
    }

    const results: {
      eventType: string;
      totalSlots: number;
      alerts: string[];
    }[] = [];

    for (const et of eventTypes) {
      const slots: Slot[] = [];

      for (const [pStart, pEnd] of periods) {
        try {
          const res = await fetch(
            `${JICOO_API_BASE}/event_types/${et.uid}/available_schedules?periodStart=${encodeURIComponent(pStart)}&periodEnd=${encodeURIComponent(pEnd)}`,
            { headers },
          );
          if (!res.ok) continue;
          const data = await res.json();
          slots.push(...((data?.data || []) as Slot[]));
        } catch {
          // skip
        }
      }

      // 個別分析
      const analysis = analyzeAllSlots(slots, now, config.totalDays, config.thresholds);
      const report = formatReport(analysis, et.name);
      await notifyJicooAvailability(report);

      results.push({
        eventType: et.name,
        totalSlots: analysis.totalSlots,
        alerts: analysis.alerts,
      });
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
