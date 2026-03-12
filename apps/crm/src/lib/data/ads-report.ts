import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = () => createServiceClient() as any;

/* ── 型 ── */

export interface WeeklyAdsMetrics {
  weekLabel: string;       // "2026-W11"
  weekStart: string;       // "2026-03-09"
  weekEnd: string;         // "2026-03-15"
  // 検索キャンペーン
  searchCost: number;
  searchClicks: number;
  searchImpressions: number;
  searchCpc: number;
  searchCtr: number;
  searchCvs: number;
  // 全キャンペーン合計
  totalCost: number;
  totalClicks: number;
  totalCvs: number;
  // 前週比
  prevSearchCost: number;
  prevSearchClicks: number;
  prevSearchCpc: number;
  prevSearchCvs: number;
  // キーワードTOP5
  topKeywords: { keyword: string; matchType: string; clicks: number; cost: number; cpc: number; cvs: number }[];
  // 累計売上
  confirmedRevenue: number;
  projectedRevenue: number;
  totalCustomers: number;
  totalSeiyaku: number;
}

/* ── ISO週 ユーティリティ ── */

/** ISO週番号を取得 */
function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** 指定週の月曜〜日曜を取得 */
export function getWeekRange(year: number, week: number): { start: string; end: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

/** "2026-W11" → { year: 2026, week: 11 } */
export function parseWeekParam(param?: string): { year: number; week: number } {
  if (param && /^\d{4}-W\d{1,2}$/.test(param)) {
    const [y, w] = param.split("-W");
    return { year: parseInt(y), week: parseInt(w) };
  }
  // デフォルト: 先週
  const now = new Date();
  now.setDate(now.getDate() - 7);
  return { year: now.getFullYear(), week: getISOWeek(now) };
}

export function currentWeekParam(): string {
  const now = new Date();
  now.setDate(now.getDate() - 7); // 先週
  return `${now.getFullYear()}-W${String(getISOWeek(now)).padStart(2, "0")}`;
}

/* ── データ取得 ── */

async function fetchCampaignData(from: string, to: string) {
  const all: { date: string; campaign_name: string; clicks: number; cost: number; impressions: number; conversions: number }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase()
      .from("analytics_ads_campaign_daily")
      .select("date,campaign_name,clicks,cost,impressions,conversions")
      .gte("date", from)
      .lte("date", to)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function fetchKeywordData(from: string, to: string) {
  const all: { keyword: string; match_type: string; clicks: number; cost: number; impressions: number; conversions: number }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase()
      .from("analytics_ads_keyword_daily")
      .select("keyword,match_type,clicks,cost,impressions,conversions")
      .gte("date", from)
      .lte("date", to)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function fetchGoogleAdsRevenue() {
  // 確定売上: contracts
  const { data: customers } = await supabase()
    .from("customers")
    .select("id")
    .eq("utm_source", "googleads");

  if (!customers || customers.length === 0) {
    return { confirmedRevenue: 0, projectedRevenue: 0, totalCustomers: 0, totalSeiyaku: 0 };
  }

  const ids = customers.map((c: { id: string }) => c.id);
  const totalCustomers = ids.length;

  // 成約数
  const { data: pipeline } = await supabase()
    .from("sales_pipeline")
    .select("customer_id,stage")
    .in("customer_id", ids)
    .eq("stage", "成約");
  const totalSeiyaku = pipeline?.length || 0;

  // スクール確定
  const { data: contracts } = await supabase()
    .from("contracts")
    .select("confirmed_amount,subsidy_amount")
    .in("customer_id", ids)
    .gt("confirmed_amount", 0);

  let schoolConfirmed = 0;
  let subsidyTotal = 0;
  for (const c of contracts || []) {
    schoolConfirmed += Number(c.confirmed_amount) || 0;
    subsidyTotal += Number(c.subsidy_amount) || 0;
  }

  // エージェント確定
  const { data: agentConfirmed } = await supabase()
    .from("agent_records")
    .select("expected_referral_fee")
    .in("customer_id", ids)
    .eq("placement_confirmed", "確定");

  let agentConfirmedTotal = 0;
  for (const a of agentConfirmed || []) {
    agentConfirmedTotal += Number(a.expected_referral_fee) || 0;
  }

  // エージェント見込
  const { data: agentProjected } = await supabase()
    .from("agent_records")
    .select("expected_referral_fee")
    .in("customer_id", ids)
    .is("placement_confirmed", null);

  let agentProjectedTotal = 0;
  for (const a of agentProjected || []) {
    agentProjectedTotal += Number(a.expected_referral_fee) || 0;
  }

  const confirmedRevenue = schoolConfirmed + agentConfirmedTotal + subsidyTotal;
  const projectedRevenue = confirmedRevenue + agentProjectedTotal;

  return { confirmedRevenue, projectedRevenue, totalCustomers, totalSeiyaku };
}

/* ── メイン集計 ── */

export async function computeWeeklyAdsMetrics(year: number, week: number): Promise<WeeklyAdsMetrics> {
  const { start, end } = getWeekRange(year, week);
  const prevRange = getWeekRange(year, week - 1);

  // 並行取得
  const [campaigns, prevCampaigns, keywords, revenue] = await Promise.all([
    fetchCampaignData(start, end),
    fetchCampaignData(prevRange.start, prevRange.end),
    fetchKeywordData(start, end),
    fetchGoogleAdsRevenue(),
  ]);

  // 検索キャンペーン = "完全一致" を含むもの
  const isSearch = (name: string) => name.includes("完全一致");
  const searchRows = campaigns.filter(r => isSearch(r.campaign_name));
  const prevSearchRows = prevCampaigns.filter(r => isSearch(r.campaign_name));

  const sum = (arr: { clicks: number; cost: number; impressions: number; conversions: number }[]) => ({
    clicks: arr.reduce((s, r) => s + (r.clicks || 0), 0),
    cost: arr.reduce((s, r) => s + (r.cost || 0), 0),
    impressions: arr.reduce((s, r) => s + (r.impressions || 0), 0),
    cvs: arr.reduce((s, r) => s + (r.conversions || 0), 0),
  });

  const search = sum(searchRows);
  const prevSearch = sum(prevSearchRows);
  const total = sum(campaigns);

  // キーワードTOP5 by clicks
  const kwMap = new Map<string, { keyword: string; matchType: string; clicks: number; cost: number; cvs: number }>();
  for (const r of keywords) {
    const key = `${r.keyword}__${r.match_type}`;
    const existing = kwMap.get(key) || { keyword: r.keyword, matchType: r.match_type, clicks: 0, cost: 0, cvs: 0 };
    existing.clicks += r.clicks || 0;
    existing.cost += r.cost || 0;
    existing.cvs += r.conversions || 0;
    kwMap.set(key, existing);
  }
  const topKeywords = [...kwMap.values()]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5)
    .map(k => ({ ...k, cpc: k.clicks > 0 ? Math.round(k.cost / k.clicks) : 0 }));

  return {
    weekLabel: `${year}-W${String(week).padStart(2, "0")}`,
    weekStart: start,
    weekEnd: end,
    searchCost: search.cost,
    searchClicks: search.clicks,
    searchImpressions: search.impressions,
    searchCpc: search.clicks > 0 ? Math.round(search.cost / search.clicks) : 0,
    searchCtr: search.impressions > 0 ? Math.round((search.clicks / search.impressions) * 10000) / 100 : 0,
    searchCvs: search.cvs,
    totalCost: total.cost,
    totalClicks: total.clicks,
    totalCvs: total.cvs,
    prevSearchCost: prevSearch.cost,
    prevSearchClicks: prevSearch.clicks,
    prevSearchCpc: prevSearch.clicks > 0 ? Math.round(prevSearch.cost / prevSearch.clicks) : 0,
    prevSearchCvs: prevSearch.cvs,
    topKeywords,
    ...revenue,
  };
}
