import { NextResponse } from "next/server";
import { notifySalesReminder } from "@/lib/slack";

export const dynamic = "force-dynamic";

const JICOO_API_KEY = process.env.JICOO_API_KEY;
const JICOO_API_BASE = "https://api.jicoo.com/v1";

/**
 * 対象イベントタイプ名のリスト（部分一致）
 * 空配列 = 全イベントタイプが対象
 * 例: ["初回", "面談"] → 名前に「初回」または「面談」を含むイベントのみ
 */
const TARGET_EVENT_NAMES: string[] = [];

const TOTAL_DAYS = 15;

interface Slot {
  startedAt: string;
  remainingCapacity: number;
}

function analyzeAllSlots(allSlots: Slot[], now: Date) {
  const alerts: string[] = [];
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

  // 日別初期化（15日分）
  const dailyMap = new Map<string, number>();
  for (let d = 0; d < TOTAL_DAYS; d++) {
    const date = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const key = date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" });
    dailyMap.set(key, 0);
  }

  let nearSlots = 0;   // 0-4日目（今後5日間）
  let midSlots = 0;     // 3-9日目（4-10日目）
  let farSlots = 0;     // 9日目以降（10日目以降）
  let eveningWeekendSlots = 0; // 平日19-25時 + 土日

  for (const slot of allSlots) {
    const slotDate = new Date(slot.startedAt);
    const jstHour = parseInt(
      slotDate.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tokyo" }),
    );
    const dateKey = slotDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" });
    const jstDay = parseInt(
      slotDate.toLocaleString("en-US", { weekday: "narrow", timeZone: "Asia/Tokyo" }).length > 0
        ? String(new Date(slotDate.toLocaleString("en-US", { timeZone: "Asia/Tokyo" })).getDay())
        : "0",
    );
    // 正確なJST曜日
    const jstDate = new Date(slotDate.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const dow = jstDate.getDay(); // 0=日, 6=土

    dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + slot.remainingCapacity);

    const daysFromNow = Math.floor((slotDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysFromNow < 5) nearSlots += slot.remainingCapacity;
    if (daysFromNow >= 3 && daysFromNow < 10) midSlots += slot.remainingCapacity;
    if (daysFromNow >= 9) farSlots += slot.remainingCapacity;

    // 平日19時以降 or 土日
    const isWeekend = dow === 0 || dow === 6;
    const isEveningWeekday = dow >= 1 && dow <= 5 && jstHour >= 19;
    if (isWeekend || isEveningWeekday) {
      eveningWeekendSlots += slot.remainingCapacity;
    }
  }

  const totalSlots = allSlots.reduce((sum, s) => sum + s.remainingCapacity, 0);

  // 日別配列
  const dailyBreakdown: { dayLabel: string; slots: number }[] = [];
  let dayIdx = 0;
  dailyMap.forEach((count, date) => {
    const d = new Date(now.getTime() + dayIdx * 24 * 60 * 60 * 1000);
    const dayOfWeek = dayNames[d.getDay()];
    dailyBreakdown.push({ dayLabel: `${date}(${dayOfWeek})`, slots: count });
    dayIdx++;
  });

  // --- アラート判定 ---

  if (totalSlots <= 15) {
    alerts.push(`🔴 全体の空き枠が${totalSlots}枠（15枠以下）→ 全体的に枠が不足しています`);
  }

  if (nearSlots <= 4) {
    alerts.push(`🟠 今後5日間の空き枠が${nearSlots}枠（4枠以下）→ 直近の予約を受けられません`);
  }

  if (midSlots < 3) {
    alerts.push(`🟡 4〜10日目の空き枠が${midSlots}枠（3枠未満）→ 中期の枠確保が必要です`);
  }

  if (farSlots < 3) {
    alerts.push(`🟡 10日目以降の空き枠が${farSlots}枠（3枠未満）→ 先の日程の枠を追加してください`);
  }

  if (eveningWeekendSlots <= 6) {
    alerts.push(`🟡 平日夜(19時〜)+土日の空き枠が${eveningWeekendSlots}枠（6枠以下）→ 社会人が予約しづらい状況です`);
  }

  return { totalSlots, nearSlots, midSlots, farSlots, eveningWeekendSlots, dailyBreakdown, alerts };
}

function formatReport(analysis: ReturnType<typeof analyzeAllSlots>, eventTypeNames: string[]): string {
  const { totalSlots, nearSlots, midSlots, farSlots, eveningWeekendSlots, dailyBreakdown, alerts } = analysis;
  const hasAlert = alerts.length > 0;
  const icon = hasAlert ? "⚠️" : "✅";

  const targetLabel = eventTypeNames.length > 0
    ? `対象: ${eventTypeNames.join(", ")}`
    : "全イベントタイプ合算";

  const lines: string[] = [
    `${icon} *Jicoo 空き枠レポート* — 合計 *${totalSlots}枠*`,
    `_${targetLabel}_`,
    "",
    `📊 *期間別*`,
    `　今後5日: *${nearSlots}枠* ｜ 4〜10日目: *${midSlots}枠* ｜ 10日目〜: *${farSlots}枠*`,
    `　平日夜+土日: *${eveningWeekendSlots}枠*`,
    "",
  ];

  // 日別（5日ずつ区切って表示）
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

  const headers = { Authorization: `Bearer ${JICOO_API_KEY}` };

  try {
    // 1. イベントタイプ取得
    const etRes = await fetch(`${JICOO_API_BASE}/event_types?perPage=50`, { headers });
    if (!etRes.ok) {
      return NextResponse.json({ error: `Event types: ${etRes.status}` }, { status: 500 });
    }
    const etData = await etRes.json();
    let eventTypes = ((etData?.data || []) as {
      uid: string; name: string; status: string;
    }[]).filter((et) => et.status === "enable");

    // 対象イベントタイプをフィルタ
    if (TARGET_EVENT_NAMES.length > 0) {
      eventTypes = eventTypes.filter((et) =>
        TARGET_EVENT_NAMES.some((target) => et.name.includes(target)),
      );
    }

    if (eventTypes.length === 0) {
      return NextResponse.json({ success: true, message: "No matching event types" });
    }

    // 2. 空き枠を合算取得（7日制限があるので2回に分けて取得）
    const now = new Date();
    const allSlots: Slot[] = [];

    // 0-7日目
    const p1Start = now.toISOString();
    const p1End = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    // 7-15日目
    const p2Start = p1End;
    const p2End = new Date(now.getTime() + TOTAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    for (const et of eventTypes) {
      for (const [pStart, pEnd] of [[p1Start, p1End], [p2Start, p2End]]) {
        try {
          const res = await fetch(
            `${JICOO_API_BASE}/event_types/${et.uid}/available_schedules?periodStart=${encodeURIComponent(pStart)}&periodEnd=${encodeURIComponent(pEnd)}`,
            { headers },
          );
          if (!res.ok) continue;
          const data = await res.json();
          allSlots.push(...((data?.data || []) as Slot[]));
        } catch {
          // skip
        }
      }
    }

    // 3. 分析
    const analysis = analyzeAllSlots(allSlots, now);

    // 4. Slack salesチャンネルに送信
    const eventTypeNames = eventTypes.map((et) => et.name);
    const report = formatReport(analysis, eventTypeNames);
    await notifySalesReminder(report);

    return NextResponse.json({
      success: true,
      eventTypes: eventTypeNames,
      totalSlots: analysis.totalSlots,
      nearSlots: analysis.nearSlots,
      midSlots: analysis.midSlots,
      farSlots: analysis.farSlots,
      eveningWeekendSlots: analysis.eveningWeekendSlots,
      alerts: analysis.alerts,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
