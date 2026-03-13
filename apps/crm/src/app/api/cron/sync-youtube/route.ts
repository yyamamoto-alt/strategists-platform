import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ───── OAuth ───── */

async function refreshAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

/* ───── YouTube Data API v3 ───── */

interface VideoMeta {
  video_id: string;
  title: string;
  description: string;
  published_at: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  privacy_status: string;
}

/** ISO 8601 duration (PT1H2M3S) を秒に変換 */
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || "0") * 3600) + (parseInt(m[2] || "0") * 60) + parseInt(m[3] || "0");
}

/** チャンネルの全動画IDを取得 */
async function fetchAllVideoIds(accessToken: string): Promise<string[]> {
  // まずチャンネルIDを取得
  const chRes = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
    { headers: authHeaders(accessToken), cache: "no-store" }
  );
  if (!chRes.ok) throw new Error(`Channels API: ${chRes.status} ${await chRes.text()}`);
  const chData = await chRes.json();
  const uploadsPlaylistId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("Could not find uploads playlist");

  // uploads playlist から全動画ID取得（重複排除）
  const videoIdSet = new Set<string>();
  let pageToken = "";
  for (let i = 0; i < 10; i++) { // 最大500動画
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: authHeaders(accessToken), cache: "no-store" });
    if (!res.ok) break;
    const data = await res.json();
    for (const item of data.items || []) {
      videoIdSet.add(item.contentDetails.videoId);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return Array.from(videoIdSet);
}

/** 動画メタデータ + 統計を取得 */
async function fetchVideoDetails(accessToken: string, videoIds: string[]): Promise<VideoMeta[]> {
  const results: VideoMeta[] = [];

  // 50個ずつバッチ処理
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails,status&id=${batch.join(",")}`;
    const res = await fetch(url, { headers: authHeaders(accessToken), cache: "no-store" });
    if (!res.ok) {
      console.error(`Videos API error: ${res.status}`);
      continue;
    }
    const data = await res.json();
    for (const item of data.items || []) {
      results.push({
        video_id: item.id,
        title: item.snippet.title,
        description: (item.snippet.description || "").slice(0, 500),
        published_at: item.snippet.publishedAt,
        thumbnail_url: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || null,
        duration_seconds: parseDuration(item.contentDetails?.duration || "PT0S"),
        total_views: parseInt(item.statistics?.viewCount || "0"),
        total_likes: parseInt(item.statistics?.likeCount || "0"),
        total_comments: parseInt(item.statistics?.commentCount || "0"),
        privacy_status: item.status?.privacyStatus || "public",
      });
    }
  }

  return results;
}

/* ───── YouTube Analytics API ───── */

interface DailyRow {
  date: string;
  video_id: string;
  views: number;
  estimated_minutes_watched: number;
  average_view_duration_seconds: number;
  average_view_percentage: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  subscribers_gained: number;
  subscribers_lost: number;
  impressions: number;
  impressions_ctr: number;
  annotation_clicks: number;
  card_clicks: number;
  end_screen_clicks: number;
}

interface ChannelDailyRow {
  date: string;
  total_views: number;
  estimated_minutes_watched: number;
  subscribers_gained: number;
  subscribers_lost: number;
}

async function fetchYouTubeAnalytics(
  accessToken: string,
  startDate: string,
  endDate: string,
  videoIds: string[],
): Promise<{ videoDailyRows: DailyRow[]; channelDailyRows: ChannelDailyRow[] }> {
  const videoDailyRows: DailyRow[] = [];
  const channelDailyRows: ChannelDailyRow[] = [];

  // 1. 動画別日別レポート (200動画ずつ分割)
  for (let i = 0; i < videoIds.length; i += 200) {
    const batch = videoIds.slice(i, i + 200);
    const metrics = [
      "views", "estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage",
      "likes", "dislikes", "comments", "shares",
      "subscribersGained", "subscribersLost",
    ].join(",");

    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate,
      dimensions: "day,video",
      metrics,
      filters: `video==${batch.join(",")}`,
      sort: "day",
    });

    const res = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
      { headers: authHeaders(accessToken), cache: "no-store" }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`YT Analytics video report error: ${res.status} ${errText}`);
      continue;
    }

    const data = await res.json();
    for (const row of data.rows || []) {
      videoDailyRows.push({
        date: row[0],
        video_id: row[1],
        views: row[2] || 0,
        estimated_minutes_watched: row[3] || 0,
        average_view_duration_seconds: row[4] || 0,
        average_view_percentage: row[5] || 0,
        likes: row[6] || 0,
        dislikes: row[7] || 0,
        comments: row[8] || 0,
        shares: row[9] || 0,
        subscribers_gained: row[10] || 0,
        subscribers_lost: row[11] || 0,
        impressions: 0,
        impressions_ctr: 0,
        annotation_clicks: 0,
        card_clicks: 0,
        end_screen_clicks: 0,
      });
    }
  }

  // 2. インプレッション系メトリクス（別クエリ — 動画別）
  for (let i = 0; i < videoIds.length; i += 200) {
    const batch = videoIds.slice(i, i + 200);
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate,
      dimensions: "day,video",
      metrics: "impressions,impressionsCtr,annotationClicks,cardClicks,endScreenClicks",
      filters: `video==${batch.join(",")}`,
      sort: "day",
    });

    const res = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
      { headers: authHeaders(accessToken), cache: "no-store" }
    );

    if (!res.ok) {
      // Some metrics may not be available for all channels
      console.error(`YT Analytics impressions report: ${res.status}`);
      continue;
    }

    const data = await res.json();
    for (const row of data.rows || []) {
      const existing = videoDailyRows.find(
        r => r.date === row[0] && r.video_id === row[1]
      );
      if (existing) {
        existing.impressions = row[2] || 0;
        existing.impressions_ctr = row[3] || 0;
        existing.annotation_clicks = row[4] || 0;
        existing.card_clicks = row[5] || 0;
        existing.end_screen_clicks = row[6] || 0;
      }
    }
  }

  // 3. チャンネル全体の日別レポート
  {
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate,
      dimensions: "day",
      metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost",
      sort: "day",
    });

    const res = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
      { headers: authHeaders(accessToken), cache: "no-store" }
    );

    if (res.ok) {
      const data = await res.json();
      for (const row of data.rows || []) {
        channelDailyRows.push({
          date: row[0],
          total_views: row[1] || 0,
          estimated_minutes_watched: row[2] || 0,
          subscribers_gained: row[3] || 0,
          subscribers_lost: row[4] || 0,
        });
      }
    } else {
      console.error(`YT Analytics channel report: ${res.status}`);
    }
  }

  return { videoDailyRows, channelDailyRows };
}

/* ───── Supabase Upsert ───── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertVideos(supabase: any, videos: VideoMeta[]) {
  if (videos.length === 0) return;

  const rows = videos.map(v => ({
    video_id: v.video_id,
    title: v.title,
    description: v.description,
    published_at: v.published_at,
    thumbnail_url: v.thumbnail_url,
    duration_seconds: v.duration_seconds,
    total_views: v.total_views,
    total_likes: v.total_likes,
    total_comments: v.total_comments,
    privacy_status: v.privacy_status,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));

  // バッチで50件ずつ（重複排除済みだが念のため分割）
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase
      .from("analytics_youtube_videos")
      .upsert(batch, { onConflict: "video_id" });
    if (error) console.error("YouTube videos upsert error:", error.message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertDailyRows(supabase: any, rows: DailyRow[]) {
  if (rows.length === 0) return;

  // バッチで50件ずつ
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase
      .from("analytics_youtube_daily")
      .upsert(batch, { onConflict: "date,video_id" });
    if (error) console.error("YouTube daily upsert error:", error.message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertChannelDaily(supabase: any, rows: ChannelDailyRow[], totalSubscribers: number, totalVideos: number) {
  if (rows.length === 0) return;

  const enriched = rows.map(r => ({
    ...r,
    total_subscribers: totalSubscribers,
    total_videos: totalVideos,
  }));

  const { error } = await supabase
    .from("analytics_youtube_channel_daily")
    .upsert(enriched, { onConflict: "date" });
  if (error) console.error("YouTube channel daily upsert error:", error.message);
}

/* ───── Search Terms & Traffic Sources (cumulative) ───── */

interface SearchTermRow {
  video_id: string;
  search_term: string;
  views: number;
  estimated_minutes_watched: number;
}

interface TrafficSourceRow {
  video_id: string;
  source_type: string;
  views: number;
  estimated_minutes_watched: number;
}

async function fetchSearchTerms(accessToken: string, videoIds: string[]): Promise<SearchTermRow[]> {
  const results: SearchTermRow[] = [];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3);
  const startDate = "2024-01-01";
  const endStr = endDate.toISOString().slice(0, 10);

  // YouTube Analytics API doesn't support video+insightTrafficSourceDetail together.
  // Must query per-video. Limit to avoid quota issues.
  const maxVideos = Math.min(videoIds.length, 60);
  for (let i = 0; i < maxVideos; i++) {
    const vid = videoIds[i];
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate: endStr,
      dimensions: "insightTrafficSourceDetail",
      metrics: "views,estimatedMinutesWatched",
      filters: `video==${vid};insightTrafficSourceType==YT_SEARCH`,
      maxResults: "10",
      sort: "-views",
    });

    const res = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
      { headers: authHeaders(accessToken), cache: "no-store" }
    );

    if (!res.ok) {
      // Some videos may not have search traffic - skip silently
      continue;
    }

    const data = await res.json();
    for (const row of data.rows || []) {
      results.push({
        video_id: vid,
        search_term: row[0],
        views: row[1] || 0,
        estimated_minutes_watched: row[2] || 0,
      });
    }
  }
  return results;
}

async function fetchTrafficSources(accessToken: string, videoIds: string[]): Promise<TrafficSourceRow[]> {
  const results: TrafficSourceRow[] = [];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3);
  const startDate = "2024-01-01";
  const endStr = endDate.toISOString().slice(0, 10);

  for (let i = 0; i < videoIds.length; i += 200) {
    const batch = videoIds.slice(i, i + 200);
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate: endStr,
      dimensions: "video,insightTrafficSourceType",
      metrics: "views,estimatedMinutesWatched",
      filters: `video==${batch.join(",")}`,
      sort: "-views",
    });

    const res = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?${params}`,
      { headers: authHeaders(accessToken), cache: "no-store" }
    );

    if (!res.ok) {
      console.error(`YT traffic sources error: ${res.status}`);
      continue;
    }

    const data = await res.json();
    for (const row of data.rows || []) {
      results.push({
        video_id: row[0],
        source_type: row[1],
        views: row[2] || 0,
        estimated_minutes_watched: row[3] || 0,
      });
    }
  }
  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertSearchTerms(supabase: any, rows: SearchTermRow[]) {
  if (rows.length === 0) return;
  const dbRows = rows.map(r => ({
    video_id: r.video_id,
    search_term: r.search_term,
    views: r.views,
    estimated_minutes_watched: r.estimated_minutes_watched,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < dbRows.length; i += 100) {
    const batch = dbRows.slice(i, i + 100);
    const { error } = await supabase
      .from("analytics_youtube_search_terms")
      .upsert(batch, { onConflict: "video_id,search_term" });
    if (error) console.error("Search terms upsert error:", error.message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertTrafficSources(supabase: any, rows: TrafficSourceRow[]) {
  if (rows.length === 0) return;
  const dbRows = rows.map(r => ({
    video_id: r.video_id,
    source_type: r.source_type,
    views: r.views,
    estimated_minutes_watched: r.estimated_minutes_watched,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < dbRows.length; i += 100) {
    const batch = dbRows.slice(i, i + 100);
    const { error } = await supabase
      .from("analytics_youtube_traffic_source")
      .upsert(batch, { onConflict: "video_id,source_type" });
    if (error) console.error("Traffic sources upsert error:", error.message);
  }
}

/* ───── Main Handler ───── */

function datesBetween(from: string, to: string): { start: string; end: string } {
  return { start: from, end: to };
}

function defaultDates(): { start: string; end: string } {
  // YouTube Analytics APIは2-3日遅延。直近5日〜3日前をカバー
  const end = new Date();
  end.setDate(end.getDate() - 3);
  const start = new Date();
  start.setDate(start.getDate() - 5);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const { start, end } = fromParam && toParam
    ? datesBetween(fromParam, toParam)
    : defaultDates();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  try {
    const accessToken = await refreshAccessToken();
    console.log(`YouTube sync: ${start} ~ ${end}`);

    // 1. 動画一覧を取得
    const videoIds = await fetchAllVideoIds(accessToken);
    console.log(`Found ${videoIds.length} videos`);

    // 2. 動画メタデータ + 統計を取得・保存
    const videos = await fetchVideoDetails(accessToken, videoIds);
    await upsertVideos(supabase, videos);

    // 3. チャンネル統計（登録者数/動画数）
    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true",
      { headers: authHeaders(accessToken), cache: "no-store" }
    );
    let totalSubscribers = 0;
    let totalVideos = 0;
    if (chRes.ok) {
      const chData = await chRes.json();
      const stats = chData.items?.[0]?.statistics;
      totalSubscribers = parseInt(stats?.subscriberCount || "0");
      totalVideos = parseInt(stats?.videoCount || "0");
    }

    // 4. YouTube Analytics: 日別レポート
    const { videoDailyRows, channelDailyRows } = await fetchYouTubeAnalytics(
      accessToken, start, end, videoIds
    );

    // 5. Supabase に保存
    await upsertDailyRows(supabase, videoDailyRows);
    await upsertChannelDaily(supabase, channelDailyRows, totalSubscribers, totalVideos);

    // 6. 検索語句 + トラフィックソース（累計、毎回全更新）
    const [searchTerms, trafficSourceRows] = await Promise.all([
      fetchSearchTerms(accessToken, videoIds),
      fetchTrafficSources(accessToken, videoIds),
    ]);
    await Promise.all([
      upsertSearchTerms(supabase, searchTerms),
      upsertTrafficSources(supabase, trafficSourceRows),
    ]);

    return NextResponse.json({
      success: true,
      period: { start, end },
      videos_count: videos.length,
      daily_rows: videoDailyRows.length,
      channel_daily_rows: channelDailyRows.length,
      total_subscribers: totalSubscribers,
      search_terms: searchTerms.length,
      traffic_sources: trafficSourceRows.length,
    });
  } catch (error) {
    console.error("YouTube sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
