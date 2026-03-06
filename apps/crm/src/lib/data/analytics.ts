import { createServiceClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = () => createServiceClient() as any;

export interface PageDaily {
  date: string;
  page_path: string;
  page_title: string | null;
  segment: string;
  pageviews: number;
  sessions: number;
  users: number;
  new_users: number;
  avg_session_duration: number;
  bounce_rate: number;
  schedule_visits: number;
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

export interface SearchDaily {
  date: string;
  page_path: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// 日付範囲のデフォルト（直近7日）
function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  to.setDate(to.getDate() - 1);
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

// 前の期間
function previousDateRange(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diff = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - diff);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

/** ブログ記事別KPI（期間集計） */
export async function fetchBlogArticles(
  dateFrom?: string,
  dateTo?: string
): Promise<PageDaily[]> {
  const { from, to } = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : defaultDateRange();

  const { data, error } = await supabase()
    .from("analytics_page_daily")
    .select("*")
    .eq("segment", "blog")
    .gte("date", from)
    .lte("date", to)
    .order("pageviews", { ascending: false });

  if (error) throw new Error(error.message);

  // 同じpage_pathの日別データを集約
  const map = new Map<string, PageDaily>();
  for (const row of data || []) {
    const existing = map.get(row.page_path);
    if (existing) {
      existing.pageviews += row.pageviews;
      existing.sessions += row.sessions;
      existing.users += row.users;
      existing.new_users += row.new_users;
      existing.schedule_visits += row.schedule_visits;
      // 平均値は加重平均
      const totalSessions = existing.sessions;
      if (totalSessions > 0) {
        existing.avg_session_duration =
          (existing.avg_session_duration * (totalSessions - row.sessions) +
            row.avg_session_duration * row.sessions) /
          totalSessions;
      }
    } else {
      map.set(row.page_path, { ...row });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.pageviews - a.pageviews);
}

/** LP流入経路別（期間集計） */
export async function fetchTrafficSources(
  landingPage: string,
  dateFrom?: string,
  dateTo?: string
): Promise<TrafficDaily[]> {
  const { from, to } = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : defaultDateRange();

  const { data, error } = await supabase()
    .from("analytics_traffic_daily")
    .select("*")
    .eq("landing_page", landingPage)
    .gte("date", from)
    .lte("date", to)
    .order("sessions", { ascending: false });

  if (error) throw new Error(error.message);

  // source+medium+campaign で集約
  const map = new Map<string, TrafficDaily>();
  for (const row of data || []) {
    const key = `${row.source}|${row.medium}|${row.campaign}`;
    const existing = map.get(key);
    if (existing) {
      existing.sessions += row.sessions;
      existing.users += row.users;
      existing.new_users += row.new_users;
      existing.schedule_visits += row.schedule_visits;
    } else {
      map.set(key, { ...row });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.sessions - a.sessions);
}

/** 検索クエリ（ブログ or LP） */
export async function fetchSearchQueries(
  pageFilter?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<SearchDaily[]> {
  const { from, to } = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : defaultDateRange();

  let query = supabase()
    .from("analytics_search_daily")
    .select("*")
    .gte("date", from)
    .lte("date", to);

  if (pageFilter) {
    query = query.like("page_path", `${pageFilter}%`);
  }

  const { data, error } = await query.order("clicks", { ascending: false }).limit(100);

  if (error) throw new Error(error.message);

  // query単位で集約
  const map = new Map<string, SearchDaily>();
  for (const row of data || []) {
    const key = `${row.page_path}|${row.query}`;
    const existing = map.get(key);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.ctr = existing.clicks / existing.impressions;
      // position は加重平均
      existing.position =
        (existing.position * (existing.impressions - row.impressions) +
          row.position * row.impressions) /
        existing.impressions;
    } else {
      map.set(key, { ...row });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.clicks - a.clicks);
}

/** サマリーKPI（今週 vs 前週） */
export async function fetchSummaryKPI(dateFrom?: string, dateTo?: string) {
  const { from, to } = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : defaultDateRange();
  const prev = previousDateRange(from, to);

  const [currentPages, prevPages, currentTrafficMain, currentTrafficLp3] = await Promise.all([
    supabase().from("analytics_page_daily").select("pageviews,sessions,users,schedule_visits").gte("date", from).lte("date", to),
    supabase().from("analytics_page_daily").select("pageviews,sessions,users,schedule_visits").gte("date", prev.from).lte("date", prev.to),
    supabase().from("analytics_traffic_daily").select("sessions,schedule_visits").eq("landing_page", "/").gte("date", from).lte("date", to),
    supabase().from("analytics_traffic_daily").select("sessions,schedule_visits").eq("landing_page", "/lp3/").gte("date", from).lte("date", to),
  ]);

  const sum = (rows: { data: Record<string, number>[] | null }, key: string) =>
    (rows.data || []).reduce((s, r) => s + (r[key] || 0), 0);

  const current = {
    pageviews: sum(currentPages, "pageviews"),
    sessions: sum(currentPages, "sessions"),
    users: sum(currentPages, "users"),
    schedule_visits: sum(currentPages, "schedule_visits"),
    lp_main_sessions: sum(currentTrafficMain, "sessions"),
    lp_main_cv: sum(currentTrafficMain, "schedule_visits"),
    lp3_sessions: sum(currentTrafficLp3, "sessions"),
    lp3_cv: sum(currentTrafficLp3, "schedule_visits"),
  };

  const previous = {
    pageviews: sum(prevPages, "pageviews"),
    sessions: sum(prevPages, "sessions"),
    users: sum(prevPages, "users"),
    schedule_visits: sum(prevPages, "schedule_visits"),
  };

  return { current, previous, dateRange: { from, to }, prevDateRange: prev };
}
