import { createServiceClient } from "@/lib/supabase/server";
import { sendSlackMessage } from "@/lib/slack";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_CHANNEL = "C0951QVAJ5N"; // 日次レポートと同じチャンネル

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

interface VideoInfo {
  video_id: string;
  title: string;
  published_at: string;
  duration_seconds: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
}

interface DailyMetrics {
  views: number;
  estimated_minutes_watched: number;
  average_view_percentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribers_gained: number;
  impressions: number;
  impressions_ctr: number;
}

async function getNotifyChannel(db: DB): Promise<string | null> {
  const { data: enabledRow } = await db
    .from("app_settings").select("value").eq("key", "slack_notify_youtube_report").single();
  if (enabledRow?.value === "false") return null;

  const { data: channelRow } = await db
    .from("app_settings").select("value").eq("key", "slack_channel_youtube_report").single();
  return channelRow?.value?.replace(/"/g, "") || DEFAULT_CHANNEL;
}

/** 公開からN日後の動画を見つける */
async function findVideosPublishedNDaysAgo(db: DB, daysAgo: number): Promise<VideoInfo[]> {
  const target = new Date();
  target.setDate(target.getDate() - daysAgo);
  const dateStr = target.toISOString().slice(0, 10);

  const { data, error } = await db
    .from("analytics_youtube_videos")
    .select("video_id,title,published_at,duration_seconds,total_views,total_likes,total_comments")
    .gte("published_at", `${dateStr}T00:00:00`)
    .lt("published_at", `${dateStr}T23:59:59`)
    .eq("is_active", true);

  if (error) {
    console.error("findVideos error:", error.message);
    return [];
  }
  return data || [];
}

/** 動画の公開後N日間の累計メトリクスを取得 */
async function getVideoMetrics(db: DB, videoId: string, publishedAt: string, days: number): Promise<DailyMetrics> {
  const startDate = publishedAt.slice(0, 10);
  const endDate = new Date(new Date(startDate).getTime() + days * 86400000).toISOString().slice(0, 10);

  const { data } = await db
    .from("analytics_youtube_daily")
    .select("views,estimated_minutes_watched,average_view_percentage,likes,comments,shares,subscribers_gained,impressions,impressions_ctr")
    .eq("video_id", videoId)
    .gte("date", startDate)
    .lte("date", endDate);

  const metrics: DailyMetrics = {
    views: 0, estimated_minutes_watched: 0, average_view_percentage: 0,
    likes: 0, comments: 0, shares: 0, subscribers_gained: 0,
    impressions: 0, impressions_ctr: 0,
  };

  let avgCount = 0;
  for (const r of data || []) {
    metrics.views += r.views || 0;
    metrics.estimated_minutes_watched += r.estimated_minutes_watched || 0;
    metrics.likes += r.likes || 0;
    metrics.comments += r.comments || 0;
    metrics.shares += r.shares || 0;
    metrics.subscribers_gained += r.subscribers_gained || 0;
    metrics.impressions += r.impressions || 0;
    if (r.average_view_percentage > 0) {
      metrics.average_view_percentage += r.average_view_percentage;
      avgCount++;
    }
  }
  if (avgCount > 0) metrics.average_view_percentage /= avgCount;
  if (metrics.impressions > 0) metrics.impressions_ctr = (metrics.views / metrics.impressions) * 100;

  return metrics;
}

/** 全動画の同期間の平均メトリクスを取得（比較用） */
async function getChannelAverageMetrics(db: DB, days: number): Promise<DailyMetrics & { videoCount: number }> {
  // 直近の動画の公開後N日間の平均を算出
  const { data: recentVideos } = await db
    .from("analytics_youtube_videos")
    .select("video_id,published_at")
    .eq("is_active", true)
    .order("published_at", { ascending: false })
    .limit(20);

  const allMetrics: DailyMetrics[] = [];
  for (const v of recentVideos || []) {
    const m = await getVideoMetrics(db, v.video_id, v.published_at, days);
    if (m.views > 0) allMetrics.push(m);
  }

  const avg: DailyMetrics = {
    views: 0, estimated_minutes_watched: 0, average_view_percentage: 0,
    likes: 0, comments: 0, shares: 0, subscribers_gained: 0,
    impressions: 0, impressions_ctr: 0,
  };
  const n = allMetrics.length || 1;
  for (const m of allMetrics) {
    avg.views += m.views / n;
    avg.estimated_minutes_watched += m.estimated_minutes_watched / n;
    avg.average_view_percentage += m.average_view_percentage / n;
    avg.likes += m.likes / n;
    avg.comments += m.comments / n;
    avg.shares += m.shares / n;
    avg.subscribers_gained += m.subscribers_gained / n;
    avg.impressions += m.impressions / n;
    avg.impressions_ctr += m.impressions_ctr / n;
  }

  return { ...avg, videoCount: allMetrics.length };
}

/** AI分析を生成 */
async function generateAnalysis(
  video: VideoInfo,
  metrics: DailyMetrics,
  channelAvg: DailyMetrics & { videoCount: number },
  reportType: "速報" | "確定",
  days: number,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "（AI分析: ANTHROPIC_API_KEY未設定）";

  const anthropic = new Anthropic({ apiKey });

  const vsAvg = (val: number, avg: number) => {
    if (avg === 0) return "N/A";
    const pct = ((val - avg) / avg * 100).toFixed(0);
    return `${Number(pct) > 0 ? "+" : ""}${pct}%`;
  };

  const prompt = `あなたはYouTubeマーケティングの専門家です。以下の動画のパフォーマンスを分析してください。

## 動画情報
- タイトル: ${video.title}
- 公開日: ${video.published_at.slice(0, 10)}
- 動画の長さ: ${Math.floor(video.duration_seconds / 60)}分${video.duration_seconds % 60}秒
- チャンネル: コンサル転職スクール「Strategists」（ケース面接対策、戦略コンサル転職を扱うYouTubeチャンネル）

## 公開後${days}日間のKPI
- 視聴回数: ${metrics.views}回（チャンネル平均: ${Math.round(channelAvg.views)}回, ${vsAvg(metrics.views, channelAvg.views)}）
- 総視聴時間: ${metrics.estimated_minutes_watched.toFixed(1)}分（平均: ${channelAvg.estimated_minutes_watched.toFixed(1)}分）
- 平均視聴率: ${metrics.average_view_percentage.toFixed(1)}%（平均: ${channelAvg.average_view_percentage.toFixed(1)}%）
- いいね: ${metrics.likes}（平均: ${Math.round(channelAvg.likes)}）
- コメント: ${metrics.comments}（平均: ${Math.round(channelAvg.comments)}）
- シェア: ${metrics.shares}（平均: ${Math.round(channelAvg.shares)}）
- 登録者獲得: ${metrics.subscribers_gained}（平均: ${Math.round(channelAvg.subscribers_gained)}）

## レポートタイプ
${reportType}値レポート（公開後${days}日）

## 分析指示
1. このKPIが良い/悪い点を簡潔に指摘（2-3行）
2. タイトルや想定される動画内容から、パフォーマンスの理由を推察（2-3行）
3. 改善のための具体的な提案（1-2行）

全体で150文字以内で簡潔に。Slackメッセージ用なのでマークダウンは使わず、プレーンテキストで。`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0];
    return text.type === "text" ? text.text : "（分析生成エラー）";
  } catch (err) {
    console.error("AI analysis error:", err);
    return "（AI分析エラー）";
  }
}

/** KPI比較の矢印 */
function indicator(val: number, avg: number): string {
  if (avg === 0) return "";
  const pct = ((val - avg) / avg) * 100;
  if (pct > 20) return " 🔥";
  if (pct > 0) return " ↑";
  if (pct < -20) return " ⚠️";
  if (pct < 0) return " ↓";
  return "";
}

/** レポートメッセージ作成 */
async function buildReport(
  video: VideoInfo,
  metrics: DailyMetrics,
  channelAvg: DailyMetrics & { videoCount: number },
  reportType: "速報" | "確定",
  days: number,
): Promise<string> {
  const analysis = await generateAnalysis(video, metrics, channelAvg, reportType, days);

  const vsAvg = (val: number, avg: number) => {
    if (avg === 0) return "";
    const pct = ((val - avg) / avg * 100).toFixed(0);
    return ` (平均比${Number(pct) > 0 ? "+" : ""}${pct}%)`;
  };

  const emoji = reportType === "速報" ? "⚡" : "📊";
  const url = `https://www.youtube.com/watch?v=${video.video_id}`;

  const lines = [
    `${emoji} *YouTube 新動画 ${reportType}レポート* (公開後${days}日)`,
    ``,
    `*${video.title}*`,
    `公開日: ${video.published_at.slice(0, 10)} | 長さ: ${Math.floor(video.duration_seconds / 60)}分${video.duration_seconds % 60}秒`,
    `${url}`,
    ``,
    `*【KPI】* (比較: 直近${channelAvg.videoCount}本の平均)`,
    `  視聴回数: ${metrics.views.toLocaleString()}回${vsAvg(metrics.views, channelAvg.views)}${indicator(metrics.views, channelAvg.views)}`,
    `  視聴時間: ${metrics.estimated_minutes_watched.toFixed(1)}分${vsAvg(metrics.estimated_minutes_watched, channelAvg.estimated_minutes_watched)}`,
    `  平均視聴率: ${metrics.average_view_percentage.toFixed(1)}%${vsAvg(metrics.average_view_percentage, channelAvg.average_view_percentage)}${indicator(metrics.average_view_percentage, channelAvg.average_view_percentage)}`,
    `  いいね: ${metrics.likes}${vsAvg(metrics.likes, channelAvg.likes)}`,
    `  コメント: ${metrics.comments}${vsAvg(metrics.comments, channelAvg.comments)}`,
    `  シェア: ${metrics.shares} | 登録者獲得: ${metrics.subscribers_gained}`,
    ``,
    `*【AI分析】*`,
    analysis,
  ];

  return lines.join("\n");
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;

  const channel = await getNotifyChannel(db);
  if (!channel) {
    return NextResponse.json({ ok: true, skipped: true, reason: "notification disabled" });
  }

  const reports: { video: string; type: string; sent: boolean }[] = [];

  // 速報: 公開3日後の動画
  const videos3d = await findVideosPublishedNDaysAgo(db, 3);
  for (const video of videos3d) {
    const metrics = await getVideoMetrics(db, video.video_id, video.published_at, 3);
    const channelAvg = await getChannelAverageMetrics(db, 3);
    const message = await buildReport(video, metrics, channelAvg, "速報", 3);
    const sent = await sendSlackMessage(channel, message, { username: "YouTube分析bot" });
    reports.push({ video: video.title, type: "速報(3日)", sent });
  }

  // 確定: 公開10日後の動画
  const videos10d = await findVideosPublishedNDaysAgo(db, 10);
  for (const video of videos10d) {
    const metrics = await getVideoMetrics(db, video.video_id, video.published_at, 10);
    const channelAvg = await getChannelAverageMetrics(db, 10);
    const message = await buildReport(video, metrics, channelAvg, "確定", 10);
    const sent = await sendSlackMessage(channel, message, { username: "YouTube分析bot" });
    reports.push({ video: video.title, type: "確定(10日)", sent });
  }

  return NextResponse.json({
    ok: true,
    reports,
    checked: { videos_3d: videos3d.length, videos_10d: videos10d.length },
  });
}
