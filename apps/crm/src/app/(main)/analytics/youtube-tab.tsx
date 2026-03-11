"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type {
  YouTubeVideo,
  YouTubeDaily,
  YouTubeChannelDaily,
  YouTubeFunnelCustomer,
} from "@/lib/data/analytics";

/* ───── Types ───── */
type YouTubeSub = "overview" | "videos" | "trends" | "funnel";

/* ───── Shared ───── */
function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
      active ? "bg-brand/20 text-brand border border-brand/30" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
    }`}>{label}</button>
  );
}

function KpiCard({ title, value, sub }: { title: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{title}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
      <div className="mt-1">{sub}</div>
    </div>
  );
}

function getWeekKey(d: string): string {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(dt);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s > 0 ? `${s}秒` : ""}` : `${s}秒`;
}

function kpiChange(current: number, prev: number, invert?: boolean) {
  if (prev === 0 && current === 0) return <span className="text-gray-600 text-[10px]">—</span>;
  if (prev === 0) return <span className="text-green-400 text-[10px]">NEW</span>;
  const pct = ((current - prev) / prev) * 100;
  const isGood = invert ? pct < 0 : pct > 0;
  return (
    <span className={`text-[10px] ${isGood ? "text-green-400" : "text-red-400"}`}>
      {pct > 0 ? "+" : ""}{pct.toFixed(0)}% vs 前月同期
    </span>
  );
}

/* ───── Funnel Helpers ───── */
const FUNNEL_NOT_CONDUCTED = new Set(["日程未確", "未実施", "実施不可", "キャンセル", "NoShow"]);
function funnelIsClosed(stage: string | null): boolean {
  if (!stage) return false;
  return stage === "成約" || stage.startsWith("追加指導") || stage === "受講終了" || stage === "卒業";
}
function funnelIsConducted(stage: string | null): boolean {
  if (!stage) return false;
  return !FUNNEL_NOT_CONDUCTED.has(stage);
}
function funnelIsScheduled(stage: string | null): boolean {
  if (!stage) return false;
  return stage !== "日程未確";
}

/* ═══════════════════════════════════════════
   MAIN YOUTUBE TAB
   ═══════════════════════════════════════════ */

interface YouTubeTabProps {
  youtubeVideos: YouTubeVideo[];
  youtubeDaily: YouTubeDaily[];
  youtubeChannelDaily: YouTubeChannelDaily[];
  youtubeFunnel: YouTubeFunnelCustomer[];
}

export function YouTubeTab({ youtubeVideos, youtubeDaily, youtubeChannelDaily, youtubeFunnel }: YouTubeTabProps) {
  const [sub, setSub] = useState<YouTubeSub>("overview");

  const hasData = youtubeVideos.length > 0 || youtubeChannelDaily.length > 0;

  if (!hasData) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">YouTube データはまだ収集中です。cron同期完了後に表示されます。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <SubTab label="サマリー" active={sub === "overview"} onClick={() => setSub("overview")} />
        <SubTab label="動画別比較" active={sub === "videos"} onClick={() => setSub("videos")} />
        <SubTab label="週次トレンド" active={sub === "trends"} onClick={() => setSub("trends")} />
        <SubTab label="ファネル分析" active={sub === "funnel"} onClick={() => setSub("funnel")} />
      </div>
      {sub === "overview" && <YouTubeOverview youtubeVideos={youtubeVideos} youtubeDaily={youtubeDaily} channelDaily={youtubeChannelDaily} />}
      {sub === "videos" && <YouTubeVideoTable youtubeVideos={youtubeVideos} youtubeDaily={youtubeDaily} />}
      {sub === "trends" && <YouTubeWeeklyTrends youtubeVideos={youtubeVideos} youtubeDaily={youtubeDaily} />}
      {sub === "funnel" && <YouTubeFunnelTab youtubeFunnel={youtubeFunnel} />}
    </div>
  );
}

/* ─── Overview ─── */
function YouTubeOverview({ youtubeVideos, youtubeDaily, channelDaily }: {
  youtubeVideos: YouTubeVideo[];
  youtubeDaily: YouTubeDaily[];
  channelDaily: YouTubeChannelDaily[];
}) {
  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const dayOfMonth = now.getDate();

    let curViews = 0, curMinutes = 0, curSubGain = 0, curSubLost = 0;
    let prevViews = 0, prevMinutes = 0, prevSubGain = 0, prevSubLost = 0;

    for (const r of channelDaily) {
      const m = r.date.slice(0, 7);
      if (m === thisMonth) {
        curViews += r.total_views; curMinutes += r.estimated_minutes_watched;
        curSubGain += r.subscribers_gained; curSubLost += r.subscribers_lost;
      } else if (m === prevMonth) {
        const day = parseInt(r.date.slice(8, 10));
        if (day <= dayOfMonth) {
          prevViews += r.total_views; prevMinutes += r.estimated_minutes_watched;
          prevSubGain += r.subscribers_gained; prevSubLost += r.subscribers_lost;
        }
      }
    }

    // 平均視聴率は動画別日次データから算出
    let curAvgPct = 0, prevAvgPct = 0, curPctCount = 0, prevPctCount = 0;
    for (const r of youtubeDaily) {
      if (r.average_view_percentage <= 0) continue;
      const m = r.date.slice(0, 7);
      if (m === thisMonth) { curAvgPct += r.average_view_percentage; curPctCount++; }
      else if (m === prevMonth) {
        const day = parseInt(r.date.slice(8, 10));
        if (day <= dayOfMonth) { prevAvgPct += r.average_view_percentage; prevPctCount++; }
      }
    }

    const latestSubs = channelDaily.length > 0 ? channelDaily[channelDaily.length - 1].total_subscribers : 0;

    return {
      views: { current: curViews, prev: prevViews },
      minutes: { current: curMinutes, prev: prevMinutes },
      subNet: { current: curSubGain - curSubLost, prev: prevSubGain - prevSubLost },
      avgPct: { current: curPctCount > 0 ? curAvgPct / curPctCount : 0, prev: prevPctCount > 0 ? prevAvgPct / prevPctCount : 0 },
      totalSubs: latestSubs,
      totalVideos: youtubeVideos.length,
    };
  }, [channelDaily, youtubeDaily, youtubeVideos]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="今月の視聴数" value={kpis.views.current.toLocaleString()} sub={kpiChange(kpis.views.current, kpis.views.prev)} />
        <KpiCard title="視聴時間(時間)" value={`${(kpis.minutes.current / 60).toFixed(1)}h`} sub={kpiChange(kpis.minutes.current, kpis.minutes.prev)} />
        <KpiCard title="登録者純増" value={kpis.subNet.current >= 0 ? `+${kpis.subNet.current}` : String(kpis.subNet.current)} sub={kpiChange(kpis.subNet.current, kpis.subNet.prev)} />
        <KpiCard title="平均視聴率" value={`${kpis.avgPct.current.toFixed(1)}%`} sub={kpiChange(kpis.avgPct.current, kpis.avgPct.prev)} />
        <KpiCard title="総登録者数" value={kpis.totalSubs.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">現在</span>} />
        <KpiCard title="動画数" value={String(kpis.totalVideos)} sub={<span className="text-gray-500 text-[10px]">公開中</span>} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">視聴数推移（日別）</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={channelDaily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v: string) => v.slice(5)} interval={6} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#9ca3af" }} />
              <Line type="monotone" dataKey="total_views" name="視聴数" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">視聴時間推移（日別・分）</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={channelDaily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v: string) => v.slice(5)} interval={6} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#9ca3af" }} />
              <Line type="monotone" dataKey="estimated_minutes_watched" name="視聴時間(分)" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top videos by total views */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-300">人気動画（総視聴数順）</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-4">動画</th>
                <th className="text-right py-2.5 px-3">総視聴数</th>
                <th className="text-right py-2.5 px-3">いいね</th>
                <th className="text-right py-2.5 px-3">コメント</th>
                <th className="text-right py-2.5 px-3">時間</th>
                <th className="text-left py-2.5 px-3">公開日</th>
              </tr>
            </thead>
            <tbody>
              {youtubeVideos.slice(0, 15).sort((a, b) => b.total_views - a.total_views).map(v => (
                <tr key={v.video_id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3">
                      {v.thumbnail_url && (
                        <img src={v.thumbnail_url} alt="" className="w-16 h-9 rounded object-cover flex-shrink-0" />
                      )}
                      <span className="text-white font-medium truncate max-w-[300px]">{v.title}</span>
                    </div>
                  </td>
                  <td className="text-right py-2.5 px-3 text-white font-medium">{v.total_views.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-gray-300">{v.total_likes.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-gray-300">{v.total_comments.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-gray-400">{formatDuration(v.duration_seconds)}</td>
                  <td className="py-2.5 px-3 text-gray-400">{v.published_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Video Table with Weekly Heatmap ─── */
function YouTubeVideoTable({ youtubeVideos, youtubeDaily }: {
  youtubeVideos: YouTubeVideo[];
  youtubeDaily: YouTubeDaily[];
}) {
  const [period, setPeriod] = useState<"week" | "month" | "3months">("month");
  const [sortBy, setSortBy] = useState<"views" | "minutes" | "avgPct" | "likes">("views");

  const { videoStats, weekKeys } = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    if (period === "week") cutoff.setDate(cutoff.getDate() - 7);
    else if (period === "month") cutoff.setDate(cutoff.getDate() - 30);
    else cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const filtered = youtubeDaily.filter(r => r.date >= cutoffStr);

    // Video aggregate
    const statsMap = new Map<string, { views: number; minutes: number; avgPct: number; avgCount: number; likes: number; comments: number; shares: number; prevViews: number }>();
    // Weekly data
    const weekMap = new Map<string, Map<string, number>>(); // videoId -> weekKey -> views
    const allWeeks = new Set<string>();

    // Previous period for comparison
    const prevCutoff = new Date(cutoff);
    const periodDays = period === "week" ? 7 : period === "month" ? 30 : 90;
    prevCutoff.setDate(prevCutoff.getDate() - periodDays);
    const prevCutoffStr = prevCutoff.toISOString().slice(0, 10);

    for (const r of youtubeDaily) {
      if (r.date >= cutoffStr) {
        const s = statsMap.get(r.video_id) || { views: 0, minutes: 0, avgPct: 0, avgCount: 0, likes: 0, comments: 0, shares: 0, prevViews: 0 };
        s.views += r.views; s.minutes += r.estimated_minutes_watched;
        if (r.average_view_percentage > 0) { s.avgPct += r.average_view_percentage; s.avgCount++; }
        s.likes += r.likes; s.comments += r.comments; s.shares += r.shares;
        statsMap.set(r.video_id, s);

        const wk = getWeekKey(r.date);
        allWeeks.add(wk);
        if (!weekMap.has(r.video_id)) weekMap.set(r.video_id, new Map());
        const wm = weekMap.get(r.video_id)!;
        wm.set(wk, (wm.get(wk) || 0) + r.views);
      } else if (r.date >= prevCutoffStr && r.date < cutoffStr) {
        const s = statsMap.get(r.video_id) || { views: 0, minutes: 0, avgPct: 0, avgCount: 0, likes: 0, comments: 0, shares: 0, prevViews: 0 };
        s.prevViews += r.views;
        statsMap.set(r.video_id, s);
      }
    }

    const videoMeta = new Map(youtubeVideos.map(v => [v.video_id, v]));
    const videoStats = Array.from(statsMap.entries())
      .map(([vid, s]) => ({
        video_id: vid,
        meta: videoMeta.get(vid),
        views: s.views,
        minutes: s.minutes,
        avgPct: s.avgCount > 0 ? s.avgPct / s.avgCount : 0,
        likes: s.likes,
        comments: s.comments,
        shares: s.shares,
        prevViews: s.prevViews,
        weeks: weekMap.get(vid) || new Map(),
      }))
      .filter(v => v.meta)
      .sort((a, b) => b[sortBy] - a[sortBy]);

    return { videoStats, weekKeys: Array.from(allWeeks).sort() };
  }, [youtubeDaily, youtubeVideos, period, sortBy]);

  const maxWeekViews = Math.max(...videoStats.flatMap(v => Array.from(v.weeks.values())), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {(["views", "minutes", "avgPct", "likes"] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-2 py-1 text-[10px] rounded-md transition-colors ${sortBy === s ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
              {s === "views" ? "視聴数順" : s === "minutes" ? "時間順" : s === "avgPct" ? "視聴率順" : "いいね順"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {([["week", "1週間"], ["month", "1ヶ月"], ["3months", "3ヶ月"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setPeriod(v)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${period === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3 min-w-[280px]">動画</th>
                <th className="text-right py-2.5 px-2 w-16">視聴数</th>
                <th className="text-right py-2.5 px-2 w-16">前期比</th>
                <th className="text-right py-2.5 px-2 w-16">視聴時間</th>
                <th className="text-right py-2.5 px-2 w-14">視聴率</th>
                <th className="text-right py-2.5 px-2 w-12">いいね</th>
                {weekKeys.map(wk => (
                  <th key={wk} className="text-center py-2.5 px-1 w-14 whitespace-nowrap text-[10px]">{wk.slice(5)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {videoStats.slice(0, 50).map(v => {
                const change = v.prevViews > 0 ? ((v.views - v.prevViews) / v.prevViews) * 100 : (v.views > 0 ? 100 : 0);
                return (
                  <tr key={v.video_id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {v.meta?.thumbnail_url && (
                          <img src={v.meta.thumbnail_url} alt="" className="w-12 h-7 rounded object-cover flex-shrink-0" />
                        )}
                        <span className="text-white font-medium truncate max-w-[200px]">{v.meta?.title || v.video_id}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 px-2 text-white font-medium">{v.views.toLocaleString()}</td>
                    <td className="text-right py-2 px-2">
                      <span className={change > 0 ? "text-green-400 text-[10px]" : change < 0 ? "text-red-400 text-[10px]" : "text-gray-600 text-[10px]"}>
                        {change > 0 ? "+" : ""}{change.toFixed(0)}%
                      </span>
                    </td>
                    <td className="text-right py-2 px-2 text-gray-300">{v.minutes.toFixed(0)}m</td>
                    <td className="text-right py-2 px-2 text-gray-300">{v.avgPct.toFixed(1)}%</td>
                    <td className="text-right py-2 px-2 text-gray-300">{v.likes}</td>
                    {weekKeys.map(wk => {
                      const wViews = v.weeks.get(wk) || 0;
                      const intensity = wViews / maxWeekViews;
                      const bg = intensity > 0.5 ? "bg-red-500/30" : intensity > 0.2 ? "bg-red-500/15" : intensity > 0 ? "bg-red-500/5" : "";
                      return (
                        <td key={wk} className={`text-center py-2 px-1 ${bg}`} title={`${wViews} views`}>
                          <span className="text-white/70 text-[10px]">{wViews > 0 ? wViews : "—"}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {videoStats.length === 0 && <tr><td colSpan={6 + weekKeys.length} className="py-8 text-center text-gray-500">データなし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Weekly Trends ─── */
function YouTubeWeeklyTrends({ youtubeVideos, youtubeDaily }: {
  youtubeVideos: YouTubeVideo[];
  youtubeDaily: YouTubeDaily[];
}) {
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());

  // Weekly aggregated data
  const { weeklyOverview, videoWeekly, highlights } = useMemo(() => {
    const videoMeta = new Map(youtubeVideos.map(v => [v.video_id, v]));

    // Weekly overview: total channel stats per week
    const weekOverMap = new Map<string, { week: string; views: number; minutes: number; subNet: number }>();
    // Per-video weekly data
    const vidWeekMap = new Map<string, Map<string, number>>(); // videoId -> weekKey -> views
    // For highlights: this week vs last week
    const thisWeek = getWeekKey(new Date().toISOString().slice(0, 10));
    const lastWeekDate = new Date();
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeek = getWeekKey(lastWeekDate.toISOString().slice(0, 10));

    const thisWeekViews = new Map<string, number>();
    const lastWeekViews = new Map<string, number>();

    for (const r of youtubeDaily) {
      const wk = getWeekKey(r.date);

      // Overview
      const ov = weekOverMap.get(wk) || { week: wk, views: 0, minutes: 0, subNet: 0 };
      ov.views += r.views; ov.minutes += r.estimated_minutes_watched;
      ov.subNet += (r.subscribers_gained - r.subscribers_lost);
      weekOverMap.set(wk, ov);

      // Per-video
      if (!vidWeekMap.has(r.video_id)) vidWeekMap.set(r.video_id, new Map());
      const vwm = vidWeekMap.get(r.video_id)!;
      vwm.set(wk, (vwm.get(wk) || 0) + r.views);

      // Highlights
      if (wk === thisWeek) thisWeekViews.set(r.video_id, (thisWeekViews.get(r.video_id) || 0) + r.views);
      if (wk === lastWeek) lastWeekViews.set(r.video_id, (lastWeekViews.get(r.video_id) || 0) + r.views);
    }

    const weeklyOverview = Array.from(weekOverMap.values()).sort((a, b) => a.week.localeCompare(b.week));

    // Highlights
    let topVideo = "";
    let topViews = 0;
    let mostGrown = "";
    let mostGrowth = -Infinity;
    for (const [vid, views] of thisWeekViews) {
      if (views > topViews) { topViews = views; topVideo = vid; }
      const prev = lastWeekViews.get(vid) || 0;
      const growth = prev > 0 ? ((views - prev) / prev) * 100 : (views > 0 ? 100 : 0);
      if (growth > mostGrowth && views >= 5) { mostGrowth = growth; mostGrown = vid; }
    }

    // Auto-select top 5 videos if none selected
    const topByViews = Array.from(thisWeekViews.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([vid]) => vid);

    return {
      weeklyOverview,
      videoWeekly: { map: vidWeekMap, weekKeys: Array.from(weekOverMap.keys()).sort() },
      highlights: {
        topVideo: videoMeta.get(topVideo)?.title || topVideo,
        topViews,
        mostGrown: videoMeta.get(mostGrown)?.title || mostGrown,
        mostGrowth: isFinite(mostGrowth) ? mostGrowth : 0,
        defaultSelection: topByViews,
      },
    };
  }, [youtubeDaily, youtubeVideos]);

  // Use default selection if none chosen
  const activeSelection = selectedVideos.size > 0
    ? selectedVideos
    : new Set(highlights.defaultSelection);

  // Build chart data for selected videos
  const chartData = useMemo(() => {
    const videoMeta = new Map(youtubeVideos.map(v => [v.video_id, v]));

    return videoWeekly.weekKeys.map(wk => {
      const point: Record<string, string | number> = { week: wk };
      for (const vid of activeSelection) {
        const title = videoMeta.get(vid)?.title?.slice(0, 20) || vid.slice(0, 8);
        point[title] = videoWeekly.map.get(vid)?.get(wk) || 0;
      }
      return point;
    });
  }, [videoWeekly, activeSelection, youtubeVideos]);

  const chartKeys = useMemo(() => {
    const videoMeta = new Map(youtubeVideos.map(v => [v.video_id, v]));
    return Array.from(activeSelection).map(vid => videoMeta.get(vid)?.title?.slice(0, 20) || vid.slice(0, 8));
  }, [activeSelection, youtubeVideos]);

  const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

  function toggleVideo(vid: string) {
    setSelectedVideos(prev => {
      const next = new Set(prev);
      if (next.has(vid)) next.delete(vid);
      else if (next.size < 5) next.add(vid);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* This week highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">今週最も見られた動画</p>
          <p className="text-sm font-medium text-white mt-1 truncate">{highlights.topVideo || "—"}</p>
          <p className="text-xs text-red-400 mt-0.5">{highlights.topViews.toLocaleString()} 視聴</p>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">今週最も伸びた動画</p>
          <p className="text-sm font-medium text-white mt-1 truncate">{highlights.mostGrown || "—"}</p>
          <p className="text-xs text-green-400 mt-0.5">
            {highlights.mostGrowth > 0 ? "+" : ""}{highlights.mostGrowth.toFixed(0)}% vs 先週
          </p>
        </div>
      </div>

      {/* Video selector */}
      <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
        <p className="text-xs text-gray-400 mb-2">動画を選択して比較（最大5本）</p>
        <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
          {youtubeVideos.slice(0, 30).map(v => (
            <button key={v.video_id} onClick={() => toggleVideo(v.video_id)}
              className={`px-2 py-1 text-[10px] rounded-md border transition-colors truncate max-w-[200px] ${
                activeSelection.has(v.video_id) ? "bg-brand/20 text-brand border-brand/30" : "text-gray-400 border-white/10 hover:bg-white/5"
              }`}>
              {v.title.slice(0, 30)}
            </button>
          ))}
        </div>
      </div>

      {/* Comparison chart */}
      {chartData.length > 0 && (
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">選択動画の週次視聴数推移</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#9ca3af" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {chartKeys.map((key, i) => (
                <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Weekly summary table */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-300">週別サマリー</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-4">週</th>
                <th className="text-right py-2.5 px-3">総視聴数</th>
                <th className="text-right py-2.5 px-3">視聴時間(分)</th>
                <th className="text-right py-2.5 px-3">登録者純増</th>
              </tr>
            </thead>
            <tbody>
              {weeklyOverview.slice(-13).reverse().map(w => (
                <tr key={w.week} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2.5 px-4 text-white">{w.week}</td>
                  <td className="text-right py-2.5 px-3 text-white font-medium">{w.views.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-gray-300">{w.minutes.toFixed(0)}</td>
                  <td className="text-right py-2.5 px-3">
                    <span className={w.subNet >= 0 ? "text-green-400" : "text-red-400"}>{w.subNet >= 0 ? "+" : ""}{w.subNet}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Funnel (YouTube UTM customers) ─── */
function YouTubeFunnelTab({ youtubeFunnel }: { youtubeFunnel: YouTubeFunnelCustomer[] }) {
  const funnel = useMemo(() => {
    const total = youtubeFunnel.length;
    const scheduled = youtubeFunnel.filter(c => funnelIsScheduled(c.stage)).length;
    const conducted = youtubeFunnel.filter(c => funnelIsConducted(c.stage)).length;
    const closed = youtubeFunnel.filter(c => funnelIsClosed(c.stage)).length;
    const totalRevenue = youtubeFunnel.filter(c => funnelIsClosed(c.stage)).reduce((s, c) => s + c.confirmed_amount, 0);
    return { total, scheduled, conducted, closed, totalRevenue };
  }, [youtubeFunnel]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; applications: number; scheduled: number; conducted: number; closed: number }>();
    for (const c of youtubeFunnel) {
      const month = c.application_date?.slice(0, 7) || "不明";
      const ex = map.get(month) || { month, applications: 0, scheduled: 0, conducted: 0, closed: 0 };
      ex.applications++;
      if (funnelIsScheduled(c.stage)) ex.scheduled++;
      if (funnelIsConducted(c.stage)) ex.conducted++;
      if (funnelIsClosed(c.stage)) ex.closed++;
      map.set(month, ex);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)).filter(m => m.month !== "不明");
  }, [youtubeFunnel]);

  const recentClosed = useMemo(() => {
    return youtubeFunnel
      .filter(c => funnelIsClosed(c.stage))
      .sort((a, b) => (b.application_date || "").localeCompare(a.application_date || ""))
      .slice(0, 20);
  }, [youtubeFunnel]);

  if (youtubeFunnel.length === 0) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">YouTube経由の顧客データがありません</p>
      </div>
    );
  }

  const stages = [
    { label: "申し込み", count: funnel.total, color: "bg-red-500" },
    { label: "日程確定", count: funnel.scheduled, color: "bg-cyan-500" },
    { label: "面談実施", count: funnel.conducted, color: "bg-amber-500" },
    { label: "成約", count: funnel.closed, color: "bg-green-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard title="YouTube経由 申し込み" value={String(funnel.total)} sub={<span className="text-gray-500 text-[10px]">utm_source=youtube系</span>} />
        <KpiCard title="日程確定" value={String(funnel.scheduled)} sub={<span className="text-[10px] text-gray-400">{funnel.total > 0 ? `${((funnel.scheduled / funnel.total) * 100).toFixed(0)}%` : "—"}</span>} />
        <KpiCard title="面談実施" value={String(funnel.conducted)} sub={<span className="text-[10px] text-gray-400">{funnel.scheduled > 0 ? `${((funnel.conducted / funnel.scheduled) * 100).toFixed(0)}% of 日程確定` : "—"}</span>} />
        <KpiCard title="成約" value={String(funnel.closed)} sub={<span className="text-[10px] text-gray-400">{funnel.conducted > 0 ? `${((funnel.closed / funnel.conducted) * 100).toFixed(0)}% of 面談実施` : "—"}</span>} />
        <KpiCard title="成約売上合計" value={`¥${Math.round(funnel.totalRevenue).toLocaleString()}`} sub={<span className="text-[10px] text-gray-400">{funnel.closed > 0 ? `平均: ¥${Math.round(funnel.totalRevenue / funnel.closed).toLocaleString()}/件` : "—"}</span>} />
      </div>

      {/* Funnel bar */}
      <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-4">ファネル（全期間）</h3>
        <div className="space-y-3">
          {stages.map((s, i) => {
            const width = funnel.total > 0 ? (s.count / funnel.total) * 100 : 0;
            const prevCount = i > 0 ? stages[i - 1].count : s.count;
            const stepRate = prevCount > 0 ? ((s.count / prevCount) * 100).toFixed(0) : "—";
            return (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-16 text-right">{s.label}</span>
                <div className="flex-1 h-8 bg-white/5 rounded-lg overflow-hidden relative">
                  <div className={`h-full ${s.color} rounded-lg transition-all`} style={{ width: `${Math.max(width, 2)}%` }} />
                  <span className="absolute inset-0 flex items-center px-3 text-xs text-white font-medium">
                    {s.count}名 {i > 0 && <span className="ml-2 text-white/60">({stepRate}%)</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-right">
          <span className="text-xs text-gray-500">全体成約率: {funnel.total > 0 ? `${((funnel.closed / funnel.total) * 100).toFixed(1)}%` : "—"}</span>
        </div>
      </div>

      {/* Monthly trend */}
      {monthlyData.length > 1 && (
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">月別ファネル推移</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#9ca3af" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="applications" name="申し込み" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="scheduled" name="日程確定" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="conducted" name="面談実施" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="closed" name="成約" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent closed */}
      {recentClosed.length > 0 && (
        <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10">
            <h3 className="text-sm font-medium text-gray-300">YouTube経由の成約顧客</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-gray-400">
                  <th className="text-left py-2.5 px-4">顧客名</th>
                  <th className="text-left py-2.5 px-3">申込日</th>
                  <th className="text-left py-2.5 px-3">属性</th>
                  <th className="text-left py-2.5 px-3">ステージ</th>
                  <th className="text-left py-2.5 px-3">流入元</th>
                  <th className="text-right py-2.5 px-3">確定売上</th>
                </tr>
              </thead>
              <tbody>
                {recentClosed.map(c => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4 text-white font-medium">{c.name}</td>
                    <td className="py-2.5 px-3 text-gray-400">{c.application_date || "—"}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${c.attribute === "既卒" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}`}>
                        {c.attribute || "—"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3"><span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-300">{c.stage}</span></td>
                    <td className="py-2.5 px-3 text-gray-400">{c.utm_source || "—"}</td>
                    <td className="text-right py-2.5 px-3 text-white">{c.confirmed_amount > 0 ? `¥${Math.round(c.confirmed_amount).toLocaleString()}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
