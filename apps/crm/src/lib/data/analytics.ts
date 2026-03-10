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

export interface SearchDailyRow {
  date: string;
  page_path: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface HourlyRow {
  date: string;
  hour: number;
  segment: string;
  pageviews: number;
  sessions: number;
  users: number;
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

/** 検索データ日別生データ（90日、キーワード追跡用） */
export async function fetchSearchDailyRows(days: number = 90): Promise<SearchDailyRow[]> {
  const { from, to } = dateRange(days);

  const { data, error } = await supabase()
    .from("analytics_search_daily")
    .select("date,page_path,query,clicks,impressions,ctr,position")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true })
    .limit(5000);

  if (error) throw new Error(error.message);
  return data || [];
}

/* ───── Google Ads データ ───── */

export interface AdsCampaignDaily {
  date: string;
  campaign_name: string;
  campaign_status: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avg_cpc: number;
  cost: number;
  conversions: number;
  cv_application: number;
  cv_micro: number;
  cost_per_conversion: number;
}

export interface AdsKeywordDaily {
  date: string;
  campaign_name: string;
  keyword: string;
  match_type: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  conversions: number;
  cv_application: number;
  cv_micro: number;
}

/** Google Ads キャンペーン別日次データ（90日） */
export async function fetchAdsCampaignDaily(days: number = 90): Promise<AdsCampaignDaily[]> {
  const { from, to } = dateRange(days);

  const { data, error } = await supabase()
    .from("analytics_ads_campaign_daily")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) {
    console.error("Ads campaign fetch error:", error.message);
    return [];
  }
  return data || [];
}

/** Google Ads キーワード別日次データ（90日） */
export async function fetchAdsKeywordDaily(days: number = 90): Promise<AdsKeywordDaily[]> {
  const { from, to } = dateRange(days);

  const { data, error } = await supabase()
    .from("analytics_ads_keyword_daily")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) {
    console.error("Ads keyword fetch error:", error.message);
    return [];
  }
  return data || [];
}

/** 時間帯別データ（90日） */
export async function fetchHourlyData(days: number = 90): Promise<HourlyRow[]> {
  const { from, to } = dateRange(days);

  const { data, error } = await supabase()
    .from("analytics_page_hourly")
    .select("date,hour,segment,pageviews,sessions,users")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) {
    // Table may not exist yet
    console.error("Hourly data fetch error:", error.message);
    return [];
  }
  return data || [];
}

/* ───── Google Ads ファネル分析（CRM自社データ） ───── */

export interface AdsFunnelCustomer {
  id: string;
  name: string;
  application_date: string | null;
  attribute: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  stage: string | null;
  confirmed_amount: number;
}

const NOT_CONDUCTED_STAGES = new Set([
  "日程未確", "未実施", "実施不可", "キャンセル", "NoShow",
]);

function adsFunnelIsClosed(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return stage === "成約" || stage.startsWith("追加指導") || stage === "受講終了" || stage === "卒業";
}

function adsFunnelIsConducted(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return !NOT_CONDUCTED_STAGES.has(stage);
}

function adsFunnelIsScheduled(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return stage !== "日程未確";
}

/** Google Ads UTM経由の顧客ファネルデータ */
export async function fetchAdsFunnelData(): Promise<AdsFunnelCustomer[]> {
  const { data, error } = await supabase()
    .from("customers")
    .select("id,name,application_date,attribute,utm_source,utm_medium,utm_campaign,sales_pipeline(stage),contracts(confirmed_amount)")
    .eq("utm_source", "googleads")
    .order("application_date", { ascending: false });

  if (error) {
    console.error("Ads funnel fetch error:", error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    application_date: row.application_date,
    attribute: row.attribute,
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.utm_campaign,
    stage: row.sales_pipeline?.stage ?? null,
    confirmed_amount: row.contracts?.confirmed_amount ?? 0,
  }));
}

export { adsFunnelIsClosed, adsFunnelIsConducted, adsFunnelIsScheduled };
