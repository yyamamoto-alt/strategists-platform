import { createServiceClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = () => createServiceClient() as any;

export interface PageDailyRow {
  date: string;
  page_path: string;
  page_title: string | null;
  segment: string;
  pageviews: number;
  sessions: number;
  users: number;
}

export interface TrafficDaily {
  date: string;
  landing_page: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  channel_group: string | null;
  sessions: number;
  users: number;
  new_users: number;
  schedule_visits: number;
}

export interface SearchQueryRow {
  page_path: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function dateRange(days: number): { from: string; to: string } {
  const to = new Date();
  to.setDate(to.getDate() - 1);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/** 全ページ日別生データ（90日） */
export async function fetchPageDailyRows(days: number = 90): Promise<PageDailyRow[]> {
  const { from, to } = dateRange(days);

  const { data, error } = await supabase()
    .from("analytics_page_daily")
    .select("date,page_path,page_title,segment,pageviews,sessions,users")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/** LP流入経路（90日、日別生データ） */
export async function fetchTrafficSources(days: number = 90): Promise<TrafficDaily[]> {
  const { from, to } = dateRange(days);

  const { data, error } = await supabase()
    .from("analytics_traffic_daily")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

/** 検索クエリ（30日、ページ×クエリ集計済み） */
export async function fetchSearchQueries(): Promise<SearchQueryRow[]> {
  const { from, to } = dateRange(30);

  const { data, error } = await supabase()
    .from("analytics_search_daily")
    .select("page_path,query,clicks,impressions,ctr,position")
    .gte("date", from)
    .lte("date", to)
    .gt("clicks", 0)
    .order("clicks", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  // page_path × query で集約
  const map = new Map<string, SearchQueryRow>();
  for (const row of data || []) {
    const key = `${row.page_path}|${row.query}`;
    const existing = map.get(key);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.ctr = existing.impressions > 0 ? existing.clicks / existing.impressions : 0;
    } else {
      map.set(key, { ...row });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.clicks - a.clicks);
}
