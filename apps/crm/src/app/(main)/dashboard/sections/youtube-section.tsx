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

/** 週キーを算出（月曜始まり） */
function weekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

function funnelIsClosed(stage: string | null): boolean {
  if (!stage) return false;
  return stage === "成約" || stage.startsWith("追加指導") || stage === "受講終了" || stage === "卒業";
}

function isKisotsu(attr: string | null): boolean {
  if (!attr) return false;
  return attr.includes("既卒") || attr.includes("中途");
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
  }));

  // --- Aggregate daily data into weekly, per video ---
  const weeklyViewsMap = new Map<string, Map<string, number>>();
  const weeklyMinutesMap = new Map<string, Map<string, number>>();

  for (const d of daily) {
    const wk = weekKey(d.date);

    if (!weeklyViewsMap.has(wk)) weeklyViewsMap.set(wk, new Map());
    const wv = weeklyViewsMap.get(wk)!;
    wv.set(d.video_id, (wv.get(d.video_id) || 0) + d.views);

    if (!weeklyMinutesMap.has(wk)) weeklyMinutesMap.set(wk, new Map());
    const wm = weeklyMinutesMap.get(wk)!;
    wm.set(d.video_id, (wm.get(d.video_id) || 0) + d.estimated_minutes_watched);
  }

  // Convert to sorted arrays (drop last incomplete week)
  const toWeeklyArray = (map: Map<string, Map<string, number>>): YouTubeWeeklyVideoData[] => {
    const arr = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, vmap]) => ({
        weekKey: wk,
        videoBreakdown: Object.fromEntries(vmap),
      }));
    // Drop last week (incomplete)
    return arr.length > 1 ? arr.slice(0, -1) : arr;
  };

  const weeklyViews = toWeeklyArray(weeklyViewsMap);
  const weeklyMinutes = toWeeklyArray(weeklyMinutesMap);

  // --- Task 2: YouTube funnel LTV monthly ---
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
      // 既卒: confirmed_amount goes to school_kisotsu
      entry.school_kisotsu += c.confirmed_amount;
      entry.subsidy += c.subsidy_amount;
      entry.agent_fee += agentFee;
    } else {
      // 新卒: confirmed_amount + subsidy goes to shinsotsu
      entry.shinsotsu += c.confirmed_amount + c.subsidy_amount;
    }

    entry.customers.push({ name: c.name, ltv });
  }

  const ltvMonthly: YouTubeLTVMonthlyRow[] = Array.from(ltvMonthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  return (
    <YouTubeDashboardClient
      weeklyViews={weeklyViews}
      weeklyMinutes={weeklyMinutes}
      videoInfoMap={videoInfoMap}
      ltvMonthly={ltvMonthly}
    />
  );
}
