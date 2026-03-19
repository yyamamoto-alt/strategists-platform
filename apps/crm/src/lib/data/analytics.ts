import { createServiceClient } from "@/lib/supabase/server";
import { AGENT_CATEGORIES } from "@/lib/calc-fields";

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
  avg_session_duration?: number;
  bounce_rate?: number;
  schedule_visits?: number;
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

  // ~100 pages/day × 90 days = ~9000 rows; Supabase default is 1000
  const all: PageDailyRow[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase()
      .from("analytics_page_daily")
      .select("date,page_path,page_title,segment,pageviews,sessions,users,avg_session_duration,bounce_rate,schedule_visits")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** LP流入経路（日別生データ） */
export async function fetchTrafficSources(days: number = 180): Promise<TrafficDaily[]> {
  const { from, to } = dateRange(days);

  const all: TrafficDaily[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase()
      .from("analytics_traffic_daily")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
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

/** Google Ads キャンペーン別日次データ */
export async function fetchAdsCampaignDaily(days: number = 90): Promise<AdsCampaignDaily[]> {
  const { from, to } = dateRange(days);
  const all: AdsCampaignDaily[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase()
      .from("analytics_ads_campaign_daily")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error("Ads campaign fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** Google Ads キーワード別日次データ */
export async function fetchAdsKeywordDaily(days: number = 90): Promise<AdsKeywordDaily[]> {
  const { from, to } = dateRange(days);
  const all: AdsKeywordDaily[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase()
      .from("analytics_ads_keyword_daily")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error("Ads keyword fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** 時間帯別データ（90日） */
export async function fetchHourlyData(days: number = 90): Promise<HourlyRow[]> {
  const { from, to } = dateRange(days);

  const all: HourlyRow[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase()
      .from("analytics_page_hourly")
      .select("date,hour,segment,pageviews,sessions,users")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("Hourly data fetch error:", error.message);
      return all;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
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
  subsidy_amount: number;
  expected_referral_fee: number;
  referral_category: string | null;
}

/** エージェント利用者か判定（referral_categoryが「フル利用」「一部利用」「自社」「該当」） */
export function isAgentFunnelCustomer(c: { referral_category: string | null }): boolean {
  return !!c.referral_category && AGENT_CATEGORIES.has(c.referral_category);
}

/** 見込みLTV算出: スクール確定 + 補助金 + 人材報酬（エージェント利用者のみ） */
export function calcFunnelLTV(c: AdsFunnelCustomer): number {
  const agent = isAgentFunnelCustomer(c) ? c.expected_referral_fee : 0;
  return c.confirmed_amount + c.subsidy_amount + agent;
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

/** Google広告帰属の顧客ファネルデータ（customer_channel_attributionベース） */
export async function fetchAdsFunnelData(): Promise<AdsFunnelCustomer[]> {
  // 1. Google広告帰属の顧客IDを取得
  const { data: attrData, error: attrError } = await supabase()
    .from("customer_channel_attribution")
    .select("customer_id")
    .like("marketing_channel", "%Google広告%");

  if (attrError || !attrData || attrData.length === 0) {
    if (attrError) console.error("Google Ads attribution fetch error:", attrError.message);
    return [];
  }

  const customerIds = attrData.map((r: { customer_id: string }) => r.customer_id);

  // 2. 顧客データをバッチで取得（PostgREST URLサイズ制限回避）
  const BATCH = 200;
  const allRows: AdsFunnelCustomer[] = [];
  for (let i = 0; i < customerIds.length; i += BATCH) {
    const batch = customerIds.slice(i, i + BATCH);
    const { data, error } = await supabase()
      .from("customers")
      .select("id,name,application_date,attribute,utm_source,utm_medium,utm_campaign,sales_pipeline(stage),contracts(confirmed_amount,subsidy_amount,referral_category),agent_records(expected_referral_fee)")
      .in("id", batch)
      .order("application_date", { ascending: false });

    if (error) {
      console.error("Ads funnel fetch error:", error.message);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (obj: any) => Array.isArray(obj) ? obj[0] : obj;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allRows.push(...(data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      application_date: row.application_date,
      attribute: row.attribute,
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      utm_campaign: row.utm_campaign,
      stage: r(row.sales_pipeline)?.stage ?? null,
      confirmed_amount: r(row.contracts)?.confirmed_amount ?? 0,
      subsidy_amount: r(row.contracts)?.subsidy_amount ?? 0,
      expected_referral_fee: r(row.agent_records)?.expected_referral_fee ?? 0,
      referral_category: r(row.contracts)?.referral_category ?? null,
    })));
  }
  return allRows;
}

export { adsFunnelIsClosed, adsFunnelIsConducted, adsFunnelIsScheduled };

/* ───── Meta (Facebook) Ads データ ───── */

export interface MetaCampaignDaily {
  date: string;
  campaign_name: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  link_clicks: number;
  landing_page_views: number;
  cv_custom: number;
  reach: number;
  frequency: number;
  cpm: number;
}

export interface MetaAdsetDaily {
  date: string;
  campaign_name: string;
  adset_name: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  link_clicks: number;
  landing_page_views: number;
  cv_custom: number;
  reach: number;
  frequency: number;
  cpm: number;
}

export interface MetaAdDaily {
  date: string;
  campaign_name: string;
  adset_name: string;
  ad_name: string;
  ad_id: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  link_clicks: number;
  landing_page_views: number;
  cv_custom: number;
  reach: number;
  frequency: number;
  cpm: number;
}

/** Meta Ads キャンペーン別日次データ */
export async function fetchMetaCampaignDaily(days: number = 90): Promise<MetaCampaignDaily[]> {
  const { from, to } = dateRange(days);
  const all: MetaCampaignDaily[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase()
      .from("analytics_meta_campaign_daily")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error("Meta campaign fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** Meta Ads 広告セット別日次データ */
export async function fetchMetaAdsetDaily(days: number = 90): Promise<MetaAdsetDaily[]> {
  const { from, to } = dateRange(days);
  const all: MetaAdsetDaily[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase()
      .from("analytics_meta_adset_daily")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error("Meta adset fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** Meta Ads 広告（クリエイティブ）別日次データ */
export async function fetchMetaAdDaily(days: number = 90): Promise<MetaAdDaily[]> {
  const { from, to } = dateRange(days);
  const all: MetaAdDaily[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase()
      .from("analytics_meta_ad_daily")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error("Meta ad fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** Meta広告帰属の顧客ファネルデータ（customer_channel_attributionベース） */
export async function fetchMetaFunnelData(): Promise<AdsFunnelCustomer[]> {
  // 1. Meta広告帰属の顧客IDを取得（純粋 + 重複チャネル両方）
  const { data: attrData, error: attrError } = await supabase()
    .from("customer_channel_attribution")
    .select("customer_id")
    .like("marketing_channel", "%FB広告%");

  if (attrError || !attrData || attrData.length === 0) {
    if (attrError) console.error("Meta attribution fetch error:", attrError.message);
    return [];
  }

  const customerIds = attrData.map((r: { customer_id: string }) => r.customer_id);

  // 2. 顧客データをバッチで取得（PostgREST URLサイズ制限回避）
  const BATCH = 200;
  const allRows: AdsFunnelCustomer[] = [];
  for (let i = 0; i < customerIds.length; i += BATCH) {
    const batch = customerIds.slice(i, i + BATCH);
    const { data, error } = await supabase()
      .from("customers")
      .select("id,name,application_date,attribute,utm_source,utm_medium,utm_campaign,sales_pipeline(stage),contracts(confirmed_amount,subsidy_amount,referral_category),agent_records(expected_referral_fee)")
      .in("id", batch)
      .order("application_date", { ascending: false });

    if (error) {
      console.error("Meta funnel fetch error:", error.message);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (obj: any) => Array.isArray(obj) ? obj[0] : obj;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allRows.push(...(data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      application_date: row.application_date,
      attribute: row.attribute,
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      utm_campaign: row.utm_campaign,
      stage: r(row.sales_pipeline)?.stage ?? null,
      confirmed_amount: r(row.contracts)?.confirmed_amount ?? 0,
      subsidy_amount: r(row.contracts)?.subsidy_amount ?? 0,
      expected_referral_fee: r(row.agent_records)?.expected_referral_fee ?? 0,
      referral_category: r(row.contracts)?.referral_category ?? null,
    })));
  }
  return allRows;
}

/* ───── YouTube Analytics ───── */

export interface YouTubeVideo {
  video_id: string;
  title: string;
  published_at: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  privacy_status: string;
}

export interface YouTubeDaily {
  date: string;
  video_id: string;
  views: number;
  estimated_minutes_watched: number;
  average_view_duration_seconds: number;
  average_view_percentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribers_gained: number;
  subscribers_lost: number;
  impressions: number;
  impressions_ctr: number;
}

export interface YouTubeChannelDaily {
  date: string;
  total_views: number;
  estimated_minutes_watched: number;
  subscribers_gained: number;
  subscribers_lost: number;
  total_subscribers: number;
}

export interface YouTubeFunnelCustomer {
  id: string;
  name: string;
  application_date: string | null;
  attribute: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  application_reason: string | null;
  initial_channel: string | null;
  stage: string | null;
  confirmed_amount: number;
  contract_total: number;
  plan_name: string | null;
  subsidy_amount: number;
  expected_referral_fee: number;
  referral_category: string | null;
  source_type: "utm" | "application_reason" | "initial_channel";
}

/** YouTube動画マスタ一覧 */
export async function fetchYouTubeVideos(): Promise<YouTubeVideo[]> {
  const { data, error } = await supabase()
    .from("analytics_youtube_videos")
    .select("video_id,title,published_at,thumbnail_url,duration_seconds,total_views,total_likes,total_comments,privacy_status")
    .eq("is_active", true)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("YouTube videos fetch error:", error.message);
    return [];
  }
  return data || [];
}

/** YouTube動画別日別KPI（全期間） */
export async function fetchYouTubeDaily(): Promise<YouTubeDaily[]> {
  const all: YouTubeDaily[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase()
      .from("analytics_youtube_daily")
      .select("date,video_id,views,estimated_minutes_watched,average_view_duration_seconds,average_view_percentage,likes,comments,shares,subscribers_gained,subscribers_lost,impressions,impressions_ctr")
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error("YouTube daily fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** YouTubeチャンネル日別KPI（全期間） */
export async function fetchYouTubeChannelDaily(): Promise<YouTubeChannelDaily[]> {
  const all: YouTubeChannelDaily[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase()
      .from("analytics_youtube_channel_daily")
      .select("date,total_views,estimated_minutes_watched,subscribers_gained,subscribers_lost,total_subscribers")
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error("YouTube channel daily fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** YouTube動画別流入元データ */
export interface YouTubeTrafficSource {
  video_id: string;
  source_type: string;
  views: number;
  estimated_minutes_watched: number;
}

export async function fetchYouTubeTrafficSources(): Promise<YouTubeTrafficSource[]> {
  const { data, error } = await supabase()
    .from("analytics_youtube_traffic_source")
    .select("video_id,source_type,views,estimated_minutes_watched")
    .order("views", { ascending: false });

  if (error) {
    console.error("YouTube traffic source fetch error:", error.message);
    return [];
  }
  return data || [];
}

/** YouTube動画別検索語句 */
export interface YouTubeSearchTerm {
  video_id: string;
  search_term: string;
  views: number;
}

export async function fetchYouTubeSearchTerms(): Promise<YouTubeSearchTerm[]> {
  const { data, error } = await supabase()
    .from("analytics_youtube_search_terms")
    .select("video_id,search_term,views")
    .order("views", { ascending: false });

  if (error) {
    console.error("YouTube search terms fetch error:", error.message);
    return [];
  }
  return data || [];
}

/** YouTube経由の顧客ファネル（UTM + 申込理由 + 初回チャネル） */
export async function fetchYouTubeFunnelData(): Promise<YouTubeFunnelCustomer[]> {
  // 3つのソースから取得してマージ（重複排除）
  const seen = new Set<string>();
  const results: YouTubeFunnelCustomer[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rel = (obj: any) => Array.isArray(obj) ? obj[0] : obj;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRow = (row: any, sourceType: "utm" | "application_reason" | "initial_channel"): YouTubeFunnelCustomer => {
    const sp = rel(row.sales_pipeline);
    const ct = rel(row.contracts);
    const ar = rel(row.agent_records);
    return {
      id: row.id,
      name: row.name,
      application_date: row.application_date,
      attribute: row.attribute,
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      utm_campaign: row.utm_campaign,
      application_reason: row.application_reason ?? null,
      initial_channel: sp?.initial_channel ?? null,
      stage: sp?.stage ?? null,
      confirmed_amount: ct?.confirmed_amount ?? 0,
      contract_total: ct?.contract_total ?? 0,
      plan_name: ct?.plan_name ?? null,
      subsidy_amount: ct?.subsidy_amount ?? 0,
      expected_referral_fee: ar?.expected_referral_fee ?? 0,
      referral_category: ct?.referral_category ?? null,
      source_type: sourceType,
    };
  };

  const ytSelect = "id,name,application_date,attribute,utm_source,utm_medium,utm_campaign,application_reason,sales_pipeline(stage,initial_channel),contracts(confirmed_amount,contract_total,plan_name,subsidy_amount,referral_category),agent_records(expected_referral_fee)";

  // 1. UTM経由 (utm_source に youtube/yt/lp3 を含む)
  const { data: utmData } = await supabase()
    .from("customers")
    .select(ytSelect)
    .or("utm_source.ilike.%youtube%,utm_source.ilike.%yt%,utm_source.eq.lp3")
    .order("application_date", { ascending: false });
  for (const row of utmData || []) {
    if (!seen.has(row.id)) { seen.add(row.id); results.push(mapRow(row, "utm")); }
  }

  // 2. 申込理由にYouTubeを含む
  const { data: reasonData } = await supabase()
    .from("customers")
    .select(ytSelect)
    .ilike("application_reason", "%youtube%")
    .order("application_date", { ascending: false });
  for (const row of reasonData || []) {
    if (!seen.has(row.id)) { seen.add(row.id); results.push(mapRow(row, "application_reason")); }
  }

  // 3. initial_channel = YouTube（ネストフィルタ不可のためクライアント側フィルタ）
  const { data: channelData } = await supabase()
    .from("customers")
    .select(ytSelect)
    .order("application_date", { ascending: false });
  for (const row of channelData || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initialChannel = (row as any).sales_pipeline?.initial_channel || "";
    if (initialChannel.toLowerCase().includes("youtube") && !seen.has(row.id)) {
      seen.add(row.id);
      results.push(mapRow(row, "initial_channel"));
    }
  }

  return results;
}
