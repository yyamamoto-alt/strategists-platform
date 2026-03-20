import {
  fetchYouTubeVideos,
  fetchYouTubeDaily,
  fetchYouTubeFunnelData,
} from "@/lib/data/analytics";
import { AGENT_CATEGORIES } from "@/lib/calc-fields";
import {
  YouTubeDashboardClient,
  type YouTubeWeeklyVideoData,
  type YouTubeVideoInfo,
  type YouTubeLTVMonthlyRow,
} from "./youtube-client";

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function funnelIsClosed(stage: string | null): boolean {
  if (!stage) return false;
  return stage === "成約" || stage.startsWith("追加指導") || stage === "受講終了" || stage === "卒業";
}

function isKisotsu(attr: string | null): boolean {
  if (!attr) return false;
  return attr.includes("既卒") || attr.includes("中途");
}

/** 2つの月の間のすべての月キーを生成 */
function allMonthsBetween(first: string, last: string): string[] {
  const result: string[] = [];
  const [sy, sm] = first.split("-").map(Number);
  const [ey, em] = last.split("-").map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

export async function YouTubeSection() {
  const [videos, daily, funnel] = await Promise.all([
    fetchYouTubeVideos(),
    fetchYouTubeDaily(),
    fetchYouTubeFunnelData(),
  ]);

  if (videos.length === 0 && daily.length === 0) return null;

  // --- Build video info map ---
  const videoInfoMap: YouTubeVideoInfo[] = videos.map(v => ({
    video_id: v.video_id,
    title: v.title,
    is_short: v.duration_seconds != null && v.duration_seconds <= 60,
  }));

  // --- Aggregate daily data into MONTHLY, per video ---
  const monthlyViewsMap = new Map<string, Map<string, number>>();
  const monthlyMinutesMap = new Map<string, Map<string, number>>();

  for (const d of daily) {
    const mk = monthKey(d.date);

    if (!monthlyViewsMap.has(mk)) monthlyViewsMap.set(mk, new Map());
    const mv = monthlyViewsMap.get(mk)!;
    mv.set(d.video_id, (mv.get(d.video_id) || 0) + d.views);

    if (!monthlyMinutesMap.has(mk)) monthlyMinutesMap.set(mk, new Map());
    const mm = monthlyMinutesMap.get(mk)!;
    mm.set(d.video_id, (mm.get(d.video_id) || 0) + d.estimated_minutes_watched);
  }

  // Convert to sorted arrays (using weekKey field for compatibility)
  const toMonthlyArray = (map: Map<string, Map<string, number>>): YouTubeWeeklyVideoData[] => {
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mk, vmap]) => ({
        weekKey: mk,
        videoBreakdown: Object.fromEntries(vmap),
      }));
  };

  const monthlyViews = toMonthlyArray(monthlyViewsMap);
  const monthlyMinutes = toMonthlyArray(monthlyMinutesMap);

  // --- YouTube funnel LTV monthly ---
  const closedCustomers = funnel.filter(c => funnelIsClosed(c.stage));

  const ltvMonthlyMap = new Map<string, {
    school_kisotsu: number;
    subsidy: number;
    agent_fee: number;
    shinsotsu: number;
    customers: { name: string; ltv: number }[];
  }>();

  for (const c of closedCustomers) {
    if (!c.application_date) continue;
    const month = c.application_date.slice(0, 7);

    if (!ltvMonthlyMap.has(month)) {
      ltvMonthlyMap.set(month, { school_kisotsu: 0, subsidy: 0, agent_fee: 0, shinsotsu: 0, customers: [] });
    }
    const entry = ltvMonthlyMap.get(month)!;

    const isAgent = !!(c.referral_category && AGENT_CATEGORIES.has(c.referral_category));
    const agentFee = isAgent ? c.expected_referral_fee : 0;
    const ltv = c.confirmed_amount + c.subsidy_amount + agentFee;

    if (isKisotsu(c.attribute)) {
      entry.school_kisotsu += c.confirmed_amount;
      entry.subsidy += c.subsidy_amount;
      entry.agent_fee += agentFee;
    } else {
      entry.shinsotsu += c.confirmed_amount + c.subsidy_amount;
    }

    entry.customers.push({ name: c.name, ltv });
  }

  // 全月を埋める（成約ゼロの月もゼロで表示）
  const allViewMonths = monthlyViews.map(m => m.weekKey);
  const allLtvMonths = Array.from(ltvMonthlyMap.keys());
  const allMonthKeys = [...new Set([...allViewMonths, ...allLtvMonths])].sort();
  const firstMonth = allMonthKeys[0] || monthKey(new Date().toISOString());
  const lastMonth = allMonthKeys[allMonthKeys.length - 1] || firstMonth;
  const fullMonths = allMonthsBetween(firstMonth, lastMonth);

  const ltvMonthly: YouTubeLTVMonthlyRow[] = fullMonths.map(month => {
    const data = ltvMonthlyMap.get(month);
    if (data) return { month, ...data };
    return { month, school_kisotsu: 0, subsidy: 0, agent_fee: 0, shinsotsu: 0, customers: [] };
  });

  return (
    <YouTubeDashboardClient
      weeklyViews={monthlyViews}
      weeklyMinutes={monthlyMinutes}
      videoInfoMap={videoInfoMap}
      ltvMonthly={ltvMonthly}
    />
  );
}
