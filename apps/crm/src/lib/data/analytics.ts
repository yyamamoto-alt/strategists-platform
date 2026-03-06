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

export interface PageAggregated {
  page_path: string;
  page_title: string | null;
  segment: string;
  pageviews: number;
  sessions: number;
  users: number;
  avg_session_duration: number;
  schedule_visits: number;
}

export interface DailyTrend {
  date: string;
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

export interface SearchDaily {
  date: string;
  page_path: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchByPage {
  page_path: string;
  queries: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
  total_clicks: number;
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

/** 全ページ日別生データ（グラフ用トレンド + テーブル集計） */
export async function fetchAllPages(days: number = 90): Promise<{
  aggregated: PageAggregated[];
  trend: DailyTrend[];
}> {
  const { from, to } = dateRange(days);

  const { data, error } = await supabase()
    .from("analytics_page_daily")
    .select("date,page_path,page_title,segment,pageviews,sessions,users,avg_session_duration,schedule_visits")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);
  const rows: PageDaily[] = data || [];

  // ページ別集計
  const pageMap = new Map<string, PageAggregated>();
  for (const row of rows) {
    const existing = pageMap.get(row.page_path);
    if (existing) {
      existing.pageviews += row.pageviews;
      existing.sessions += row.sessions;
      existing.users += row.users;
      existing.schedule_visits += row.schedule_visits;
    } else {
      pageMap.set(row.page_path, {
        page_path: row.page_path,
        page_title: row.page_title,
        segment: row.segment,
        pageviews: row.pageviews,
        sessions: row.sessions,
        users: row.users,
        avg_session_duration: row.avg_session_duration,
        schedule_visits: row.schedule_visits,
      });
    }
  }

  // 日別トレンド集計
  const trendMap = new Map<string, DailyTrend>();
  for (const row of rows) {
    const existing = trendMap.get(row.date);
    if (existing) {
      existing.pageviews += row.pageviews;
      existing.sessions += row.sessions;
      existing.users += row.users;
    } else {
      trendMap.set(row.date, {
        date: row.date,
        pageviews: row.pageviews,
        sessions: row.sessions,
        users: row.users,
      });
    }
  }

  return {
    aggregated: Array.from(pageMap.values()).sort((a, b) => b.pageviews - a.pageviews),
    trend: Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** LP流入経路別（期間集計） */
export async function fetchTrafficSources(days: number = 90): Promise<TrafficDaily[]> {
  const { from, to } = dateRange(days);

  const { data, error } = await supabase()
    .from("analytics_traffic_daily")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("sessions", { ascending: false });

  if (error) throw new Error(error.message);

  const map = new Map<string, TrafficDaily>();
  for (const row of data || []) {
    const key = `${row.landing_page}|${row.source}|${row.medium}|${row.campaign}`;
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

/** 検索クエリ（全ページ、ページごとにグルーピング、直近1ヶ月） */
export async function fetchSearchByPage(): Promise<SearchByPage[]> {
  const { from, to } = dateRange(30);

  const { data, error } = await supabase()
    .from("analytics_search_daily")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("clicks", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  // page_path × query で集約
  const queryMap = new Map<string, { query: string; page_path: string; clicks: number; impressions: number; position_sum: number }>();
  for (const row of data || []) {
    const key = `${row.page_path}|${row.query}`;
    const existing = queryMap.get(key);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.position_sum += row.position * row.impressions;
    } else {
      queryMap.set(key, {
        query: row.query,
        page_path: row.page_path,
        clicks: row.clicks,
        impressions: row.impressions,
        position_sum: row.position * row.impressions,
      });
    }
  }

  // ページごとにグルーピング
  const pageMap = new Map<string, SearchByPage>();
  for (const item of Array.from(queryMap.values())) {
    const ctr = item.impressions > 0 ? item.clicks / item.impressions : 0;
    const position = item.impressions > 0 ? item.position_sum / item.impressions : 0;
    const entry = {
      query: item.query,
      clicks: item.clicks,
      impressions: item.impressions,
      ctr,
      position,
    };

    const existing = pageMap.get(item.page_path);
    if (existing) {
      existing.queries.push(entry);
      existing.total_clicks += item.clicks;
    } else {
      pageMap.set(item.page_path, {
        page_path: item.page_path,
        queries: [entry],
        total_clicks: item.clicks,
      });
    }
  }

  // ページをtotal_clicks降順、各ページ内のクエリもclicks降順
  const result = Array.from(pageMap.values()).sort((a, b) => b.total_clicks - a.total_clicks);
  for (const page of result) {
    page.queries.sort((a, b) => b.clicks - a.clicks);
  }
  return result;
}
