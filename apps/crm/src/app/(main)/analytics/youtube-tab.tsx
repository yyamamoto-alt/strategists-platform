"use client";

import { useState, useMemo, Fragment } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type {
  YouTubeVideo,
  YouTubeDaily,
  YouTubeChannelDaily,
  YouTubeFunnelCustomer,
  YouTubeTrafficSource,
  YouTubeSearchTerm,
  SearchQueryRow,
  AdsKeywordDaily,
} from "@/lib/data/analytics";

/* ───── Types ───── */
type YouTubeSub = "videos" | "detail" | "customers" | "keywords";
type ChartGranularity = "daily" | "weekly" | "monthly";
type VideoSortKey = "views" | "published_at";

/* ───── Shared ───── */
function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
      active ? "bg-brand/20 text-brand border border-brand/30" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
    }`}>{label}</button>
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

function isShort(video: YouTubeVideo): boolean {
  return video.duration_seconds <= 180;
}

function GranularitySelector({ value, onChange }: { value: ChartGranularity; onChange: (g: ChartGranularity) => void }) {
  return (
    <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
      {([["daily", "日別"], ["weekly", "週別"], ["monthly", "月別"]] as const).map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-2 py-1 text-[10px] rounded-md transition-colors ${value === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>{label}</button>
      ))}
    </div>
  );
}

function aggregateByGranularity<T extends { date: string }>(
  data: T[],
  granularity: ChartGranularity,
  aggregator: (items: T[]) => Record<string, number>,
): { key: string; [k: string]: number | string }[] {
  const getKey = granularity === "daily" ? (d: string) => d
    : granularity === "weekly" ? getWeekKey : (d: string) => d.slice(0, 7);

  const groups = new Map<string, T[]>();
  for (const item of data) {
    const key = getKey(item.date);
    const arr = groups.get(key) || [];
    arr.push(item);
    groups.set(key, arr);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ key, ...aggregator(items) }));
}

/* ───── Helpers ───── */
function funnelIsClosed(stage: string | null): boolean {
  if (!stage) return false;
  return stage === "成約" || stage.startsWith("追加指導") || stage === "受講終了" || stage === "卒業";
}

function isKisotsu(attr: string | null): boolean {
  if (!attr) return false;
  return attr.includes("既卒") || attr.includes("中途");
}

function attributeBadgeColor(attr: string | null): string {
  if (!attr) return "bg-gray-500/20 text-gray-300";
  if (isKisotsu(attr)) return "bg-blue-500/20 text-blue-300";
  return "bg-orange-500/20 text-orange-300"; // 新卒系（XX卒、新卒等）
}

/* ═══════════════════════════════════════════
   MAIN YOUTUBE TAB
   ═══════════════════════════════════════════ */

interface YouTubeTabProps {
  youtubeVideos: YouTubeVideo[];
  youtubeDaily: YouTubeDaily[];
  youtubeChannelDaily: YouTubeChannelDaily[];
  youtubeFunnel: YouTubeFunnelCustomer[];
  youtubeTrafficSources: YouTubeTrafficSource[];
  youtubeSearchTerms: YouTubeSearchTerm[];
  searchQueries: SearchQueryRow[];
  adsKeywords: AdsKeywordDaily[];
}

export function YouTubeTab({ youtubeVideos, youtubeDaily, youtubeChannelDaily, youtubeFunnel, youtubeTrafficSources, youtubeSearchTerms, searchQueries, adsKeywords }: YouTubeTabProps) {
  const [sub, setSub] = useState<YouTubeSub>("videos");

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
        <SubTab label="動画別比較" active={sub === "videos"} onClick={() => setSub("videos")} />
        <SubTab label="動画別KPI詳細" active={sub === "detail"} onClick={() => setSub("detail")} />
        <SubTab label="成約顧客リスト" active={sub === "customers"} onClick={() => setSub("customers")} />
        <SubTab label="キーワード攻略" active={sub === "keywords"} onClick={() => setSub("keywords")} />
      </div>
      {sub === "videos" && <YouTubeVideoTable youtubeVideos={youtubeVideos} youtubeDaily={youtubeDaily} channelDaily={youtubeChannelDaily} />}
      {sub === "detail" && <YouTubeVideoDetailTable youtubeVideos={youtubeVideos} youtubeDaily={youtubeDaily} trafficSources={youtubeTrafficSources} searchTerms={youtubeSearchTerms} youtubeFunnel={youtubeFunnel} />}
      {sub === "customers" && <YouTubeClosedCustomersTab youtubeFunnel={youtubeFunnel} youtubeVideos={youtubeVideos} />}
      {sub === "keywords" && <YouTubeKeywordAnalysis youtubeVideos={youtubeVideos} youtubeSearchTerms={youtubeSearchTerms} trafficSources={youtubeTrafficSources} searchQueries={searchQueries} adsKeywords={adsKeywords} />}
    </div>
  );
}

/* ─── Video Table — Monthly Heatmap (like the spreadsheet) ─── */

function greenHeatmap(value: number, max: number): string {
  if (max === 0 || value === 0) return "";
  const r = value / max;
  if (r > 0.6) return "bg-emerald-500/40";
  if (r > 0.4) return "bg-emerald-500/30";
  if (r > 0.2) return "bg-emerald-500/20";
  if (r > 0.05) return "bg-emerald-500/10";
  return "bg-emerald-500/5";
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

function kpiChange(current: number, prev: number, invert?: boolean) {
  if (prev === 0 && current === 0) return <span className="text-gray-600 text-[10px]">—</span>;
  if (prev === 0) return <span className="text-green-400 text-[10px]">NEW</span>;
  const pct = ((current - prev) / prev) * 100;
  const isGood = invert ? pct < 0 : pct > 0;
  return (
    <span className={`text-[10px] ${isGood ? "text-green-400" : "text-red-400"}`}>
      {pct > 0 ? "+" : ""}{pct.toFixed(0)}% vs 前28日
    </span>
  );
}

function YouTubeVideoTable({ youtubeVideos, youtubeDaily, channelDaily }: {
  youtubeVideos: YouTubeVideo[];
  youtubeDaily: YouTubeDaily[];
  channelDaily: YouTubeChannelDaily[];
}) {
  const [includeShorts, setIncludeShorts] = useState(false);
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>("weekly");
  const [videoSort, setVideoSort] = useState<VideoSortKey>("views");

  const filteredVideos = useMemo(() =>
    includeShorts ? youtubeVideos : youtubeVideos.filter(v => !isShort(v)),
  [youtubeVideos, includeShorts]);

  const filteredVideoIds = useMemo(() => new Set(filteredVideos.map(v => v.video_id)), [filteredVideos]);

  // KPIs — 直近28日 vs その前の28日
  const kpis = useMemo(() => {
    const now = new Date();
    const cur28Start = new Date(now);
    cur28Start.setDate(cur28Start.getDate() - 28);
    const prev28Start = new Date(cur28Start);
    prev28Start.setDate(prev28Start.getDate() - 28);

    const curStartStr = cur28Start.toISOString().slice(0, 10);
    const prevStartStr = prev28Start.toISOString().slice(0, 10);
    const nowStr = now.toISOString().slice(0, 10);

    let curViews = 0, curMinutes = 0, curSubGain = 0, curSubLost = 0;
    let prevViews = 0, prevMinutes = 0, prevSubGain = 0, prevSubLost = 0;

    for (const r of channelDaily) {
      if (r.date >= curStartStr && r.date <= nowStr) {
        curViews += r.total_views; curMinutes += r.estimated_minutes_watched;
        curSubGain += r.subscribers_gained; curSubLost += r.subscribers_lost;
      } else if (r.date >= prevStartStr && r.date < curStartStr) {
        prevViews += r.total_views; prevMinutes += r.estimated_minutes_watched;
        prevSubGain += r.subscribers_gained; prevSubLost += r.subscribers_lost;
      }
    }

    const latestSubs = channelDaily.length > 0 ? channelDaily[channelDaily.length - 1].total_subscribers : 0;

    return {
      views: { current: curViews, prev: prevViews },
      minutes: { current: curMinutes, prev: prevMinutes },
      subNet: { current: curSubGain - curSubLost, prev: prevSubGain - prevSubLost },
      totalSubs: latestSubs,
      totalVideos: youtubeVideos.length,
    };
  }, [channelDaily, youtubeVideos]);

  // Chart data with granularity (drop last point — incomplete period looks like a dip)
  const viewsChartData = useMemo(() => {
    const all = aggregateByGranularity(channelDaily, chartGranularity, items => ({
      total_views: items.reduce((s, r) => s + r.total_views, 0),
    }));
    return all.length > 1 ? all.slice(0, -1) : all;
  }, [channelDaily, chartGranularity]);

  const minutesChartData = useMemo(() => {
    const all = aggregateByGranularity(channelDaily, chartGranularity, items => ({
      estimated_minutes_watched: items.reduce((s, r) => s + r.estimated_minutes_watched, 0),
    }));
    return all.length > 1 ? all.slice(0, -1) : all;
  }, [channelDaily, chartGranularity]);

  // Monthly publish count
  const publishData = useMemo(() => {
    const map = new Map<string, { month: string; count: number; shorts: number }>();
    for (const v of youtubeVideos) {
      const month = v.published_at.slice(0, 7);
      const ex = map.get(month) || { month, count: 0, shorts: 0 };
      ex.count++;
      if (isShort(v)) ex.shorts++;
      map.set(month, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [youtubeVideos]);

  // Monthly heatmap data
  const { videoRows, monthKeys, maxMonthViews, maxTotalViews } = useMemo(() => {
    const monthMap = new Map<string, Map<string, number>>();
    const allMonths = new Set<string>();

    for (const r of youtubeDaily) {
      if (!filteredVideoIds.has(r.video_id)) continue;
      const month = r.date.slice(0, 7);
      allMonths.add(month);
      if (!monthMap.has(r.video_id)) monthMap.set(r.video_id, new Map());
      const vm = monthMap.get(r.video_id)!;
      vm.set(month, (vm.get(month) || 0) + r.views);
    }

    // 投稿日の最古月〜今月まで全月キーを生成
    let earliestMonth = "";
    for (const v of filteredVideos) {
      const m = v.published_at.slice(0, 7);
      if (!earliestMonth || m < earliestMonth) earliestMonth = m;
    }
    for (const m of allMonths) {
      if (!earliestMonth || m < earliestMonth) earliestMonth = m;
    }
    const nowMonth = new Date().toISOString().slice(0, 7);
    if (earliestMonth) {
      const [sy, sm] = earliestMonth.split("-").map(Number);
      const [ey, em] = nowMonth.split("-").map(Number);
      for (let y = sy, mo = sm; y < ey || (y === ey && mo <= em); mo++) {
        if (mo > 12) { mo = 1; y++; }
        allMonths.add(`${y}-${String(mo).padStart(2, "0")}`);
      }
    }
    const mKeys = Array.from(allMonths).sort().reverse();

    const rows = filteredVideos
      .map(v => {
        const months = monthMap.get(v.video_id) || new Map<string, number>();
        const totalFromDaily = Array.from(months.values()).reduce((s, x) => s + x, 0);
        return {
          video: v,
          totalViews: v.total_views || totalFromDaily,
          months,
        };
      });

    let maxV = 0;
    let maxTotal = 0;
    for (const r of rows) {
      for (const v of r.months.values()) if (v > maxV) maxV = v;
      if (r.totalViews > maxTotal) maxTotal = r.totalViews;
    }

    return { videoRows: rows, monthKeys: mKeys, maxMonthViews: maxV, maxTotalViews: maxTotal };
  }, [youtubeDaily, filteredVideos, filteredVideoIds]);

  const sortedVideoRows = useMemo(() => {
    const sorted = [...videoRows];
    if (videoSort === "views") {
      sorted.sort((a, b) => b.totalViews - a.totalViews);
    } else {
      sorted.sort((a, b) => (b.video.published_at || "").localeCompare(a.video.published_at || ""));
    }
    return sorted;
  }, [videoRows, videoSort]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="視聴数（28日）" value={kpis.views.current.toLocaleString()} sub={kpiChange(kpis.views.current, kpis.views.prev)} />
        <KpiCard title="視聴時間（28日）" value={`${(kpis.minutes.current / 60).toFixed(1)}h`} sub={kpiChange(kpis.minutes.current, kpis.minutes.prev)} />
        <KpiCard title="登録者純増（28日）" value={kpis.subNet.current >= 0 ? `+${kpis.subNet.current}` : String(kpis.subNet.current)} sub={kpiChange(kpis.subNet.current, kpis.subNet.prev)} />
        <KpiCard title="総登録者数" value={kpis.totalSubs.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">現在</span>} />
        <KpiCard title="動画数" value={String(kpis.totalVideos)} sub={<span className="text-gray-500 text-[10px]">公開中</span>} />
      </div>

      {/* Charts with granularity switcher */}
      <div className="flex justify-end">
        <GranularitySelector value={chartGranularity} onChange={setChartGranularity} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
          <h3 className="text-xs font-medium text-gray-300 mb-3">視聴数推移</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={viewsChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="key" tick={{ fontSize: 9, fill: "#6b7280" }}
                tickFormatter={(v: string, i: number) => {
                  const month = v.slice(5, 7);
                  if (chartGranularity === "monthly") return `${parseInt(month)}月`;
                  const prevMonth = i > 0 ? viewsChartData[i - 1]?.key?.slice(5, 7) : "";
                  return month !== prevMonth ? `${parseInt(month)}月` : "";
                }}
                interval={0} />
              <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#9ca3af" }} />
              <Line type="monotone" dataKey="total_views" name="YouTube 視聴数" stroke="#FF0000" strokeWidth={2} dot={chartGranularity !== "daily"} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
          <h3 className="text-xs font-medium text-gray-300 mb-3">視聴時間推移（分）</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={minutesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="key" tick={{ fontSize: 9, fill: "#6b7280" }}
                tickFormatter={(v: string, i: number) => {
                  const month = v.slice(5, 7);
                  if (chartGranularity === "monthly") return `${parseInt(month)}月`;
                  const prevMonth = i > 0 ? minutesChartData[i - 1]?.key?.slice(5, 7) : "";
                  return month !== prevMonth ? `${parseInt(month)}月` : "";
                }}
                interval={0} />
              <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#9ca3af" }} />
              <Line type="monotone" dataKey="estimated_minutes_watched" name="YouTube 視聴時間(分)" stroke="#FF4444" strokeWidth={2} dot={chartGranularity !== "daily"} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
          <h3 className="text-xs font-medium text-gray-300 mb-3">月別動画投稿数</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={publishData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#6b7280" }} />
              <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#9ca3af" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="count" name="YouTube 通常動画" fill="#FF0000" radius={[4, 4, 0, 0]} />
              <Bar dataKey="shorts" name="YouTube ショート" fill="#FF6666" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Video heatmap table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-500">{videoRows.length} 動画 / 月別再生回数</p>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={includeShorts} onChange={e => setIncludeShorts(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand focus:ring-brand/50" />
              <span className="text-[10px] text-gray-400">ショートを含む</span>
            </label>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span>少ない</span>
            {["bg-emerald-500/5", "bg-emerald-500/10", "bg-emerald-500/20", "bg-emerald-500/30", "bg-emerald-500/40"].map((c, i) => (
              <span key={i} className={`w-4 h-4 rounded ${c}`} />
            ))}
            <span>多い</span>
          </div>
        </div>

        <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[800px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-raised z-10">
                <tr className="border-b border-white/10 text-gray-400">
                  <th className="text-center py-2.5 px-2 w-8">No.</th>
                  <th className="text-left py-2.5 px-3 min-w-[300px]">動画名</th>
                  <th className="text-center py-2.5 px-2 w-24 cursor-pointer select-none hover:text-white transition-colors"
                    onClick={() => setVideoSort(videoSort === "published_at" ? "views" : "published_at")}>
                    投稿日 {videoSort === "published_at" ? "▼" : ""}
                  </th>
                  <th className="text-right py-2.5 px-3 w-20 cursor-pointer select-none hover:text-white transition-colors"
                    onClick={() => setVideoSort(videoSort === "views" ? "published_at" : "views")}>
                    総再生回数 {videoSort === "views" ? "▼" : ""}
                  </th>
                  {monthKeys.map(mk => {
                    const [y, m] = mk.split("-");
                    return (
                      <th key={mk} className="text-center py-2.5 px-1 w-16 whitespace-nowrap text-[10px]">
                        {y}/{parseInt(m)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedVideoRows.slice(0, 100).map((row, idx) => (
                  <tr key={row.video.video_id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="text-center py-2 px-2 text-gray-500">{idx + 1}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-3">
                        {row.video.thumbnail_url && (
                          <img src={row.video.thumbnail_url} alt="" className="w-20 h-11 rounded object-cover flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <a href={`https://www.youtube.com/watch?v=${row.video.video_id}`} target="_blank" rel="noopener noreferrer"
                            className="text-white font-medium hover:text-brand transition-colors line-clamp-2 text-xs leading-tight">
                            {row.video.title}
                          </a>
                          <div className="flex items-center gap-2 mt-0.5">
                            {isShort(row.video) && <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-300">Short</span>}
                            <span className="text-[10px] text-gray-600">{formatDuration(row.video.duration_seconds)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-2 px-2 text-gray-400 whitespace-nowrap text-[11px]">{row.video.published_at.slice(0, 10)}</td>
                    <td className={`text-right py-2 px-3 text-white font-bold text-sm ${(() => {
                      if (maxTotalViews === 0 || row.totalViews === 0) return "";
                      const r = row.totalViews / maxTotalViews;
                      if (r > 0.8) return "bg-blue-500/40";
                      if (r > 0.6) return "bg-blue-500/30";
                      if (r > 0.4) return "bg-blue-500/20";
                      if (r > 0.2) return "bg-blue-500/10";
                      return "bg-blue-500/5";
                    })()}`}>{row.totalViews.toLocaleString()}</td>
                    {monthKeys.map(mk => {
                      const val = row.months.get(mk) || 0;
                      return (
                        <td key={mk} className={`text-center py-2 px-1 ${greenHeatmap(val, maxMonthViews)}`}>
                          <span className={val > 0 ? "text-white/80 text-[10px]" : "text-gray-700 text-[10px]"}>
                            {val > 0 ? val.toLocaleString() : ""}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {sortedVideoRows.length === 0 && <tr><td colSpan={4 + monthKeys.length} className="py-8 text-center text-gray-500">データなし</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Video Detail KPI Table ─── */

const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  YT_SEARCH: "YouTube検索",
  SUBSCRIBER: "チャンネル登録者",
  YT_CHANNEL: "チャンネルページ",
  EXT_URL: "外部サイト",
  SHORTS: "ショートフィード",
  NO_LINK_OTHER: "その他",
  YT_OTHER_PAGE: "ブラウジング機能",
  RELATED_VIDEO: "関連動画",
  PLAYLIST: "再生リスト",
  NOTIFICATION: "通知",
  END_SCREEN: "終了画面",
  SHORTS_CONTENT_LINKS: "ショートリンク",
  HASHTAGS: "ハッシュタグ",
  SOUND_PAGE: "サウンドページ",
};
const TRAFFIC_SOURCE_COLORS: Record<string, string> = {
  YT_SEARCH: "#3b82f6",
  SUBSCRIBER: "#8b5cf6",
  YT_CHANNEL: "#06b6d4",
  EXT_URL: "#f59e0b",
  SHORTS: "#f97316",
  NO_LINK_OTHER: "#6b7280",
  YT_OTHER_PAGE: "#a78bfa",
  RELATED_VIDEO: "#ef4444",
  PLAYLIST: "#ec4899",
  NOTIFICATION: "#10b981",
  END_SCREEN: "#14b8a6",
  SHORTS_CONTENT_LINKS: "#fb923c",
  HASHTAGS: "#84cc16",
  SOUND_PAGE: "#d946ef",
};

// 固定表示順序: 登録者→検索→チャンネルページ→関連動画→外部→ショート→再生リスト→通知→その他→残り
const TRAFFIC_SOURCE_ORDER = [
  "SUBSCRIBER", "YT_SEARCH", "YT_CHANNEL", "RELATED_VIDEO",
  "EXT_URL", "SHORTS", "PLAYLIST", "NOTIFICATION",
  "YT_OTHER_PAGE", "NO_LINK_OTHER", "END_SCREEN",
  "SHORTS_CONTENT_LINKS", "HASHTAGS", "SOUND_PAGE",
];

function sortSourcesByFixedOrder(sources: YouTubeTrafficSource[]): YouTubeTrafficSource[] {
  return [...sources].sort((a, b) => {
    const ai = TRAFFIC_SOURCE_ORDER.indexOf(a.source_type);
    const bi = TRAFFIC_SOURCE_ORDER.indexOf(b.source_type);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function TrafficSourceBar({ sources, totalViews }: { sources: YouTubeTrafficSource[]; totalViews: number }) {
  if (sources.length === 0 || totalViews === 0) return <span className="text-gray-600 text-[10px]">—</span>;
  const ordered = sortSourcesByFixedOrder(sources);
  return (
    <div className="space-y-0.5">
      <div className="flex h-3 rounded overflow-hidden bg-white/5">
        {ordered.map(s => {
          const pct = (s.views / totalViews) * 100;
          if (pct < 1) return null;
          return (
            <div key={s.source_type} style={{ width: `${pct}%`, backgroundColor: TRAFFIC_SOURCE_COLORS[s.source_type] || "#6b7280" }}
              title={`${TRAFFIC_SOURCE_LABELS[s.source_type] || s.source_type}: ${s.views.toLocaleString()} (${pct.toFixed(0)}%)`} />
          );
        })}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {[...sources].sort((a, b) => b.views - a.views).slice(0, 3).map(s => {
          const pct = (s.views / totalViews) * 100;
          if (pct < 1) return null;
          return (
            <span key={s.source_type} className="text-[9px] text-gray-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{ backgroundColor: TRAFFIC_SOURCE_COLORS[s.source_type] || "#6b7280" }} />
              {TRAFFIC_SOURCE_LABELS[s.source_type] || s.source_type} {pct.toFixed(0)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

type DetailSortKey = "views" | "published_at" | "avg_view_pct" | "watch_hours" | "predicted" | "likes" | "like_rate" | "comments" | "ctr";

function YouTubeVideoDetailTable({ youtubeVideos, youtubeDaily, trafficSources, searchTerms, youtubeFunnel }: {
  youtubeVideos: YouTubeVideo[];
  youtubeDaily: YouTubeDaily[];
  trafficSources: YouTubeTrafficSource[];
  searchTerms: YouTubeSearchTerm[];
  youtubeFunnel: YouTubeFunnelCustomer[];
}) {
  const [detailSort, setDetailSort] = useState<DetailSortKey>("views");
  const [includeShorts, setIncludeShorts] = useState(false);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

  const filteredVideos = useMemo(() => {
    return youtubeVideos
      .filter(v => includeShorts || !isShort(v))
      .filter(v => !(v.privacy_status === "unlisted" && v.total_views <= 100));
  }, [youtubeVideos, includeShorts]);

  // Build per-video source map
  const sourceMap = useMemo(() => {
    const m = new Map<string, YouTubeTrafficSource[]>();
    for (const s of trafficSources) {
      const arr = m.get(s.video_id) || [];
      arr.push(s);
      m.set(s.video_id, arr);
    }
    return m;
  }, [trafficSources]);

  // Build per-video CV count from funnel data (UTM campaign matching)
  const videoCvMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of youtubeFunnel) {
      if (!funnelIsClosed(c.stage)) continue;
      const matched = matchCampaignToVideo(c.utm_campaign, youtubeVideos);
      if (matched) {
        m.set(matched.video_id, (m.get(matched.video_id) || 0) + 1);
      }
    }
    return m;
  }, [youtubeFunnel, youtubeVideos]);

  // Build per-video search terms map
  const searchTermMap = useMemo(() => {
    const m = new Map<string, YouTubeSearchTerm[]>();
    for (const s of searchTerms) {
      const arr = m.get(s.video_id) || [];
      arr.push(s);
      m.set(s.video_id, arr);
    }
    return m;
  }, [searchTerms]);

  // Build per-video daily aggregates
  const dailyMap = useMemo(() => {
    const m = new Map<string, { views: number; minutes: number; impressions: number; impressionsCtr: number; impressionCount: number }>();
    for (const d of youtubeDaily) {
      const ex = m.get(d.video_id) || { views: 0, minutes: 0, impressions: 0, impressionsCtr: 0, impressionCount: 0 };
      ex.views += d.views;
      ex.minutes += d.estimated_minutes_watched;
      ex.impressions += d.impressions;
      if (d.impressions_ctr > 0) { ex.impressionsCtr += d.impressions_ctr; ex.impressionCount++; }
      m.set(d.video_id, ex);
    }
    return m;
  }, [youtubeDaily]);

  // Build per-video daily data by day offset (for 90-day actual calculation and growth curve)
  const videoDailyByOffset = useMemo(() => {
    const m = new Map<string, Map<number, number>>(); // video_id -> (dayOffset -> views)
    for (const d of youtubeDaily) {
      const video = youtubeVideos.find(v => v.video_id === d.video_id);
      if (!video) continue;
      const pubDate = new Date(video.published_at);
      const dayOffset = Math.floor((new Date(d.date).getTime() - pubDate.getTime()) / 86400000);
      if (dayOffset < 0) continue;
      if (!m.has(d.video_id)) m.set(d.video_id, new Map());
      const vm = m.get(d.video_id)!;
      vm.set(dayOffset, (vm.get(dayOffset) || 0) + d.views);
    }
    return m;
  }, [youtubeDaily, youtubeVideos]);

  // Growth curve: average views per day-offset across mature videos (>120 days old)
  const matureCurve = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 120);
    const matureVideos = youtubeVideos.filter(v => new Date(v.published_at) < cutoff);
    if (matureVideos.length === 0) return new Map<number, number>();

    const sumByOffset = new Map<number, { total: number; count: number }>();
    for (const v of matureVideos) {
      const offsets = videoDailyByOffset.get(v.video_id);
      if (!offsets) continue;
      for (const [offset, views] of offsets) {
        if (offset > 90) continue;
        const ex = sumByOffset.get(offset) || { total: 0, count: 0 };
        ex.total += views;
        ex.count++;
        sumByOffset.set(offset, ex);
      }
    }
    const avg = new Map<number, number>();
    for (const [offset, { total, count }] of sumByOffset) {
      avg.set(offset, total / count);
    }
    return avg;
  }, [youtubeVideos, videoDailyByOffset]);

  const detailRows = useMemo(() => {
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    return filteredVideos.map(v => {
      const daily = dailyMap.get(v.video_id) || { views: 0, minutes: 0, impressions: 0, impressionsCtr: 0, impressionCount: 0 };
      const sources = sourceMap.get(v.video_id) || [];
      const totalViews = v.total_views || daily.views;
      const watchHours = daily.minutes / 60;
      const likes = v.total_likes;
      const comments = v.total_comments;
      const likeRate = totalViews > 0 ? (likes / totalViews) * 100 : 0;
      const impressions = daily.impressions;
      const ctr = daily.impressionCount > 0 ? daily.impressionsCtr / daily.impressionCount : 0;

      // Average view percentage (estimated from watch time vs duration)
      const avgViewPct = v.duration_seconds > 0 && totalViews > 0
        ? Math.min(100, (daily.minutes * 60 / (totalViews * v.duration_seconds)) * 100)
        : 0;

      const pubDate = new Date(v.published_at);
      const ageDays = Math.max(1, Math.floor((now.getTime() - pubDate.getTime()) / 86400000));
      const isNew = pubDate > threeMonthsAgo;

      // Calculate actual 90-day views for mature videos
      const offsets = videoDailyByOffset.get(v.video_id);
      let actual90 = 0;
      if (offsets && ageDays > 90) {
        for (const [offset, views] of offsets) {
          if (offset <= 90) actual90 += views;
        }
      }

      // Growth prediction for videos < 3 months old
      // Use mature video curve to predict remaining days (avoids early-boost bias)
      let predicted90 = 0;
      if (isNew && ageDays > 0) {
        // Sum actual views so far
        predicted90 = totalViews;
        // Add predicted remaining views using mature curve ratio
        for (let day = ageDays; day <= 90; day++) {
          const curveAvg = matureCurve.get(day) || matureCurve.get(Math.min(day, 90)) || 0;
          const curveAtAge = matureCurve.get(Math.max(ageDays - 1, 0)) || 1;
          const recentDailyAvg = ageDays > 14
            ? (() => { let s = 0; const o = videoDailyByOffset.get(v.video_id); if (!o) return totalViews / ageDays; for (const [off, vw] of o) { if (off >= ageDays - 14) s += vw; } return s / 14; })()
            : totalViews / ageDays;
          const scaleFactor = curveAtAge > 0 ? recentDailyAvg / curveAtAge : 1;
          predicted90 += curveAvg * scaleFactor;
        }
      }

      const cvCount = videoCvMap.get(v.video_id) || 0;

      return {
        video: v,
        totalViews,
        watchHours,
        avgViewPct,
        sources,
        isNew,
        ageDays,
        predicted90,
        actual90,
        likes,
        comments,
        likeRate,
        impressions,
        ctr,
        cvCount,
      };
    });
  }, [filteredVideos, dailyMap, sourceMap, matureCurve, videoDailyByOffset]);

  const sortedRows = useMemo(() => {
    const sorted = [...detailRows];
    switch (detailSort) {
      case "views": sorted.sort((a, b) => b.totalViews - a.totalViews); break;
      case "published_at": sorted.sort((a, b) => (b.video.published_at || "").localeCompare(a.video.published_at || "")); break;
      case "avg_view_pct": sorted.sort((a, b) => b.avgViewPct - a.avgViewPct); break;
      case "watch_hours": sorted.sort((a, b) => b.watchHours - a.watchHours); break;
      case "predicted": sorted.sort((a, b) => {
        const aVal = a.isNew ? a.predicted90 : a.actual90;
        const bVal = b.isNew ? b.predicted90 : b.actual90;
        return bVal - aVal;
      }); break;
      case "likes": sorted.sort((a, b) => b.likes - a.likes); break;
      case "like_rate": sorted.sort((a, b) => b.likeRate - a.likeRate); break;
      case "comments": sorted.sort((a, b) => b.comments - a.comments); break;
      case "ctr": sorted.sort((a, b) => b.ctr - a.ctr); break;
    }
    return sorted;
  }, [detailRows, detailSort]);

  // Max values for heatmaps
  const maxValues = useMemo(() => {
    let maxViews = 0, max90v = 0, maxAvgPct = 0, maxLikeRate = 0;
    for (const r of detailRows) {
      if (r.totalViews > maxViews) maxViews = r.totalViews;
      const v90 = r.isNew ? r.predicted90 : r.actual90;
      if (v90 > max90v) max90v = v90;
      if (r.avgViewPct > maxAvgPct) maxAvgPct = r.avgViewPct;
      if (r.likeRate > maxLikeRate) maxLikeRate = r.likeRate;
    }
    return { maxViews, max90: max90v, maxAvgPct, maxLikeRate };
  }, [detailRows]);

  function heatmapLevel(value: number, max: number): number {
    if (max === 0 || value === 0) return 0;
    const r = value / max;
    if (r > 0.8) return 5;
    if (r > 0.6) return 4;
    if (r > 0.4) return 3;
    if (r > 0.2) return 2;
    return 1;
  }

  const HM_VIEWS = ["", "bg-emerald-500/5", "bg-emerald-500/10", "bg-emerald-500/20", "bg-emerald-500/30", "bg-emerald-500/40"];
  const HM_90 = ["", "bg-blue-500/5", "bg-blue-500/10", "bg-blue-500/20", "bg-blue-500/30", "bg-blue-500/40"];
  const HM_PCT = ["", "bg-indigo-500/5", "bg-indigo-500/10", "bg-indigo-500/20", "bg-indigo-500/30", "bg-indigo-500/40"];
  const HM_LIKE = ["", "bg-pink-500/5", "bg-pink-500/10", "bg-pink-500/20", "bg-pink-500/30", "bg-pink-500/40"];

  function heatmapViews(value: number): string { return HM_VIEWS[heatmapLevel(value, maxValues.maxViews)]; }
  function heatmap90(value: number): string { return HM_90[heatmapLevel(value, maxValues.max90)]; }
  function heatmapPct(value: number): string { return HM_PCT[heatmapLevel(value, maxValues.maxAvgPct)]; }
  function heatmapLikeRate(value: number): string { return HM_LIKE[heatmapLevel(value, maxValues.maxLikeRate)]; }

  const sortHeader = (key: DetailSortKey, label: string, align = "text-right") => (
    <th className={`${align} py-2.5 px-2 cursor-pointer select-none hover:text-white transition-colors whitespace-nowrap`}
      onClick={() => setDetailSort(key)}>
      {label} {detailSort === key ? "▼" : ""}
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{sortedRows.length} 動画 / KPI詳細</p>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={includeShorts} onChange={e => setIncludeShorts(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand focus:ring-brand/50" />
          <span className="text-[10px] text-gray-400">ショートを含む</span>
        </label>
      </div>

      {/* Traffic source legend */}
      <div className="flex gap-2 flex-wrap justify-end">
        {["SUBSCRIBER", "YT_SEARCH", "YT_CHANNEL", "RELATED_VIDEO", "EXT_URL", "SHORTS", "YT_OTHER_PAGE", "PLAYLIST", "NOTIFICATION", "NO_LINK_OTHER"].map(key => (
          <span key={key} className="flex items-center gap-1 text-[9px] text-gray-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TRAFFIC_SOURCE_COLORS[key] }} />
            {TRAFFIC_SOURCE_LABELS[key]}
          </span>
        ))}
      </div>

      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[800px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400 text-[10px]">
                <th className="text-center py-2 px-1 w-6">#</th>
                <th className="text-left py-2 px-2 min-w-[120px] max-w-[160px]">動画名</th>
                {sortHeader("published_at", "投稿日", "text-center")}
                <th className="text-center py-2 px-1 whitespace-nowrap">公開</th>
                {sortHeader("views", "再生数")}
                {sortHeader("predicted", "90日")}
                {sortHeader("watch_hours", "時間")}
                {sortHeader("avg_view_pct", "維持率")}
                {sortHeader("likes", "高評価")}
                {sortHeader("like_rate", "高評価率")}
                {sortHeader("comments", "コメント")}
                {sortHeader("ctr", "CTR")}
                <th className="text-center py-2 px-1 min-w-[140px]">流入元</th>
                <th className="text-right py-2 px-1 whitespace-nowrap cursor-pointer select-none hover:text-white transition-colors">CV</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.slice(0, 100).map((row, idx) => {
                const isExpanded = expandedVideo === row.video.video_id;
                return (
                  <Fragment key={row.video.video_id}>
                    <tr className={`border-b border-white/5 hover:bg-white/5 cursor-pointer ${isExpanded ? "bg-white/5" : ""}`}
                      onClick={() => setExpandedVideo(isExpanded ? null : row.video.video_id)}>
                      <td className="text-center py-1.5 px-1 text-gray-500 text-[10px]">{idx + 1}</td>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-1.5">
                          {row.video.thumbnail_url && (
                            <img src={row.video.thumbnail_url} alt="" className="w-14 h-8 rounded object-cover flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="text-white text-[10px] leading-tight line-clamp-2">{row.video.title}</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              {isShort(row.video) && <span className="text-[8px] px-0.5 rounded bg-yellow-500/20 text-yellow-300">S</span>}
                              {row.isNew && <span className="text-[8px] px-0.5 rounded bg-blue-500/20 text-blue-300">新</span>}
                              <span className="text-[9px] text-gray-600">{formatDuration(row.video.duration_seconds)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-center py-1.5 px-1 text-gray-400 whitespace-nowrap text-[10px]">{row.video.published_at.slice(5, 10)}</td>
                      <td className="text-center py-1.5 px-1">
                        <span className={`text-[9px] px-1 py-0.5 rounded ${
                          row.video.privacy_status === "public" ? "bg-green-500/20 text-green-300" :
                          row.video.privacy_status === "unlisted" ? "bg-yellow-500/20 text-yellow-300" :
                          "bg-red-500/20 text-red-300"
                        }`}>
                          {row.video.privacy_status === "public" ? "公開" :
                           row.video.privacy_status === "unlisted" ? "限定" : "非公開"}
                        </span>
                      </td>
                      <td className={`text-right py-1.5 px-1 ${heatmapViews(row.totalViews)}`}>
                        <span className="text-white font-bold text-[11px]">{row.totalViews.toLocaleString()}</span>
                      </td>
                      <td className={`text-right py-1.5 px-1 ${heatmap90(row.isNew ? row.predicted90 : row.actual90)}`}>
                        {row.isNew ? (
                          row.predicted90 > 0 ? (
                            <div>
                              <span className="text-blue-300 font-medium text-[10px]">{Math.round(row.predicted90).toLocaleString()}</span>
                              <div className="text-[8px] text-gray-500">予測</div>
                            </div>
                          ) : (
                            <div>
                              <span className="text-gray-500 text-[10px]">{row.totalViews.toLocaleString()}</span>
                              <div className="text-[8px] text-gray-600">{row.ageDays}日</div>
                            </div>
                          )
                        ) : (
                          <div>
                            <span className="text-white font-medium text-[10px]">{row.actual90.toLocaleString()}</span>
                            <div className="text-[8px] text-gray-500">実績</div>
                          </div>
                        )}
                      </td>
                      <td className="text-right py-1.5 px-1 text-gray-300 text-[10px]">{row.watchHours.toFixed(1)}h</td>
                      <td className={`text-right py-1.5 px-1 ${heatmapPct(row.avgViewPct)}`}>
                        <span className={`text-[10px] ${row.avgViewPct >= 40 ? "text-green-400" : row.avgViewPct >= 20 ? "text-yellow-400" : "text-red-400"}`}>
                          {row.avgViewPct.toFixed(0)}%
                        </span>
                      </td>
                      <td className="text-right py-1.5 px-1 text-gray-300 text-[10px]">{row.likes.toLocaleString()}</td>
                      <td className={`text-right py-1.5 px-1 ${heatmapLikeRate(row.likeRate)}`}>
                        <span className={`text-[10px] ${row.likeRate >= 3 ? "text-green-400" : row.likeRate >= 1 ? "text-yellow-400" : "text-gray-500"}`}>
                          {row.likeRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-right py-1.5 px-1 text-gray-300 text-[10px]">{row.comments}</td>
                      <td className="text-right py-1.5 px-1">
                        <span className={`text-[10px] ${row.ctr >= 5 ? "text-green-400" : row.ctr >= 2 ? "text-yellow-400" : "text-gray-500"}`}>
                          {row.ctr > 0 ? `${row.ctr.toFixed(1)}%` : "—"}
                        </span>
                      </td>
                      <td className="py-1.5 px-1">
                        <TrafficSourceBar sources={row.sources} totalViews={row.totalViews} />
                      </td>
                      <td className="text-right py-1.5 px-1">
                        {row.cvCount > 0 ? (
                          <span className="text-green-400 font-bold text-[11px]">{row.cvCount}</span>
                        ) : (
                          <span className="text-gray-700 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-white/10 bg-white/[0.02]">
                        <td colSpan={14} className="px-4 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-[10px]">
                            <div>
                              <p className="text-gray-500 mb-1">基本情報</p>
                              <p className="text-gray-300">投稿日: {row.video.published_at.slice(0, 10)}</p>
                              <p className="text-gray-300">経過日数: {row.ageDays}日</p>
                              <p className="text-gray-300">動画長: {formatDuration(row.video.duration_seconds)}</p>
                              <a href={`https://www.youtube.com/watch?v=${row.video.video_id}`} target="_blank" rel="noopener noreferrer"
                                className="text-brand hover:underline mt-1 inline-block">YouTubeで開く →</a>
                            </div>
                            <div>
                              <p className="text-gray-500 mb-1">エンゲージメント</p>
                              <p className="text-gray-300">高評価: {row.likes.toLocaleString()} ({row.likeRate.toFixed(2)}%)</p>
                              <p className="text-gray-300">コメント: {row.comments}</p>
                              <p className="text-gray-300">インプレッション: {row.impressions.toLocaleString()}</p>
                              <p className="text-gray-300">クリック率: {row.ctr > 0 ? `${row.ctr.toFixed(2)}%` : "—"}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 mb-1">視聴</p>
                              <p className="text-gray-300">総再生数: {row.totalViews.toLocaleString()}</p>
                              <p className="text-gray-300">視聴時間: {row.watchHours.toFixed(1)}h</p>
                              <p className="text-gray-300">平均維持率: {row.avgViewPct.toFixed(1)}%</p>
                            </div>
                            <div>
                              <p className="text-gray-500 mb-1">流入元内訳</p>
                              {row.sources.length > 0 ? (
                                sortSourcesByFixedOrder(row.sources).map(s => (
                                  <p key={s.source_type} className="text-gray-300 flex justify-between">
                                    <span>
                                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: TRAFFIC_SOURCE_COLORS[s.source_type] || "#6b7280" }} />
                                      {TRAFFIC_SOURCE_LABELS[s.source_type] || s.source_type}
                                    </span>
                                    <span>{s.views.toLocaleString()} ({((s.views / row.totalViews) * 100).toFixed(0)}%)</span>
                                  </p>
                                ))
                              ) : <p className="text-gray-600">データなし</p>}
                            </div>
                            <div>
                              <p className="text-gray-500 mb-1">検索語句 (TOP10)</p>
                              {(() => {
                                const terms = searchTermMap.get(row.video.video_id) || [];
                                if (terms.length === 0) return <p className="text-gray-600">データなし</p>;
                                return terms.slice(0, 10).map((t, i) => (
                                  <p key={i} className="text-gray-300 flex justify-between">
                                    <span className="truncate mr-2">{t.search_term}</span>
                                    <span className="flex-shrink-0">{t.views.toLocaleString()}</span>
                                  </p>
                                ));
                              })()}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {sortedRows.length === 0 && <tr><td colSpan={14} className="py-8 text-center text-gray-500">データなし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Closed Customers (YouTube attribution) ─── */

function matchCampaignToVideo(campaign: string | null, videos: YouTubeVideo[]): YouTubeVideo | null {
  if (!campaign) return null;
  const c = campaign.toLowerCase();
  // Try to match by video number pattern like "41番" or "No.41" or just the title text
  for (const v of videos) {
    const t = v.title.toLowerCase();
    // Check if campaign contains a substantial part of the video title
    if (t.length > 5 && c.includes(t.slice(0, 20).toLowerCase())) return v;
    if (c.includes(v.video_id)) return v;
  }
  // Try matching keywords from campaign to video titles (at least 4 chars)
  const words = campaign.split(/[\s_\-/|]+/).filter(w => w.length >= 4);
  for (const w of words) {
    const wl = w.toLowerCase();
    for (const v of videos) {
      if (v.title.toLowerCase().includes(wl)) return v;
    }
  }
  return null;
}

function YouTubeClosedCustomersTab({ youtubeFunnel, youtubeVideos }: {
  youtubeFunnel: YouTubeFunnelCustomer[];
  youtubeVideos: YouTubeVideo[];
}) {
  const closedCustomers = useMemo(() => {
    return youtubeFunnel
      .filter(c => funnelIsClosed(c.stage))
      .sort((a, b) => (b.application_date || "").localeCompare(a.application_date || ""));
  }, [youtubeFunnel]);

  const totalRevenue = useMemo(() =>
    closedCustomers.reduce((s, c) => s + c.confirmed_amount, 0),
  [closedCustomers]);

  const isAgent = (c: YouTubeFunnelCustomer) => c.referral_category === "フル利用" || c.referral_category === "一部利用";
  const totalLTV = useMemo(() =>
    closedCustomers.reduce((s, c) => s + c.confirmed_amount + c.subsidy_amount + (isAgent(c) ? c.expected_referral_fee : 0), 0),
  [closedCustomers]);

  if (closedCustomers.length === 0) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">YouTube経由の成約顧客データがありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="成約顧客数" value={`${closedCustomers.length}名`}
          sub={<span className="text-gray-500 text-[10px]">YouTube経由</span>} />
        <KpiCard title="確定売上合計" value={`¥${Math.round(totalRevenue).toLocaleString()}`}
          sub={<span className="text-gray-500 text-[10px]">平均: ¥{closedCustomers.length > 0 ? Math.round(totalRevenue / closedCustomers.length).toLocaleString() : 0}/件</span>} />
        <KpiCard title="LTV合計（見込含む）" value={`¥${Math.round(totalLTV).toLocaleString()}`}
          sub={<span className="text-gray-500 text-[10px]">確定+人材+補助金</span>} />
        <KpiCard title="既卒系/新卒系" value={`${closedCustomers.filter(c => isKisotsu(c.attribute)).length} / ${closedCustomers.filter(c => !isKisotsu(c.attribute)).length}`}
          sub={<span className="text-gray-500 text-[10px]">属性別内訳</span>} />
      </div>

      {/* Closed customers table */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-300">YouTube経由 成約顧客一覧（{closedCustomers.length}名）</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-4">顧客名</th>
                <th className="text-left py-2.5 px-3">申込日</th>
                <th className="text-left py-2.5 px-3">属性</th>
                <th className="text-left py-2.5 px-3">プラン</th>
                <th className="text-left py-2.5 px-3">ステージ</th>
                <th className="text-left py-2.5 px-3">検出元</th>
                <th className="text-left py-2.5 px-3 min-w-[200px]">流入動画</th>
                <th className="text-right py-2.5 px-3">確定売上</th>
                <th className="text-right py-2.5 px-3">契約合計</th>
                <th className="text-right py-2.5 px-3">補助金</th>
                <th className="text-right py-2.5 px-3">人材見込</th>
                <th className="text-right py-2.5 px-3">LTV</th>
              </tr>
            </thead>
            <tbody>
              {closedCustomers.map(c => {
                const matchedVideo = matchCampaignToVideo(c.utm_campaign, youtubeVideos);
                const agentFee = isAgent(c) ? c.expected_referral_fee : 0;
                const ltv = c.confirmed_amount + c.subsidy_amount + agentFee;
                return (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4 text-white font-medium whitespace-nowrap">{c.name}</td>
                    <td className="py-2.5 px-3 text-gray-400 whitespace-nowrap">{c.application_date || "—"}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${attributeBadgeColor(c.attribute)}`}>
                        {c.attribute || "—"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-300 whitespace-nowrap">{c.plan_name || "—"}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-300">{c.stage}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        c.source_type === "utm" ? "bg-cyan-500/20 text-cyan-300"
                          : c.source_type === "application_reason" ? "bg-pink-500/20 text-pink-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}>
                        {c.source_type === "utm" ? "UTM" : c.source_type === "application_reason" ? "申込理由" : "初回CH"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {matchedVideo ? (
                        <a href={`https://www.youtube.com/watch?v=${matchedVideo.video_id}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 hover:text-brand transition-colors">
                          {matchedVideo.thumbnail_url && (
                            <img src={matchedVideo.thumbnail_url} alt="" className="w-12 h-7 rounded object-cover flex-shrink-0" />
                          )}
                          <span className="text-white text-[10px] line-clamp-2 leading-tight">{matchedVideo.title}</span>
                        </a>
                      ) : (
                        <span className="text-gray-500 text-[10px] truncate max-w-[200px] block">{c.utm_campaign || "—"}</span>
                      )}
                    </td>
                    <td className="text-right py-2.5 px-3 text-white font-medium whitespace-nowrap">
                      {c.confirmed_amount > 0 ? `¥${Math.round(c.confirmed_amount).toLocaleString()}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-300 whitespace-nowrap">
                      {c.contract_total > 0 ? `¥${Math.round(c.contract_total).toLocaleString()}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 whitespace-nowrap">
                      {c.subsidy_amount > 0 ? (
                        <span className="text-emerald-300">¥{Math.round(c.subsidy_amount).toLocaleString()}</span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="text-right py-2.5 px-3 whitespace-nowrap">
                      {agentFee > 0 ? (
                        <span className="text-amber-300">¥{Math.round(agentFee).toLocaleString()}</span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="text-right py-2.5 px-3 text-white font-bold whitespace-nowrap">
                      {ltv > 0 ? `¥${Math.round(ltv).toLocaleString()}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   KEYWORD ATTACK ANALYSIS
   ═══════════════════════════════════════════ */

interface KeywordAnalysisProps {
  youtubeVideos: YouTubeVideo[];
  youtubeSearchTerms: YouTubeSearchTerm[];
  trafficSources: YouTubeTrafficSource[];
  searchQueries: SearchQueryRow[];
  adsKeywords: AdsKeywordDaily[];
}

/* ───── Static attack list: target keywords ───── */
const ATTACK_KEYWORDS: { keyword: string; category: "戦略ファーム" | "面接対策" | "転職" | "スキル" | "業界理解"; firmType?: "戦略" | "総合"; cvIntent: "HIGH" | "MID" | "LOW" }[] = [
  // 戦略ファーム × ケース面接 (最優先)
  { keyword: "マッキンゼー ケース面接", category: "戦略ファーム", firmType: "戦略", cvIntent: "HIGH" },
  { keyword: "BCG ケース面接", category: "戦略ファーム", firmType: "戦略", cvIntent: "HIGH" },
  { keyword: "ベイン ケース面接", category: "戦略ファーム", firmType: "戦略", cvIntent: "HIGH" },
  { keyword: "ローランドベルガー ケース面接", category: "戦略ファーム", firmType: "戦略", cvIntent: "HIGH" },
  { keyword: "ATカーニー ケース面接", category: "戦略ファーム", firmType: "戦略", cvIntent: "HIGH" },
  { keyword: "Strategy& 面接", category: "戦略ファーム", firmType: "戦略", cvIntent: "HIGH" },
  { keyword: "オリバーワイマン", category: "戦略ファーム", firmType: "戦略", cvIntent: "MID" },
  // 戦略ファーム単体
  { keyword: "マッキンゼー", category: "戦略ファーム", firmType: "戦略", cvIntent: "MID" },
  { keyword: "ベインアンドカンパニー", category: "戦略ファーム", firmType: "戦略", cvIntent: "MID" },
  { keyword: "BCG", category: "戦略ファーム", firmType: "戦略", cvIntent: "LOW" },
  { keyword: "MBB", category: "戦略ファーム", firmType: "戦略", cvIntent: "MID" },
  // 面接対策 (CV直結)
  { keyword: "ケース面接 中途", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "戦略コンサル 対策", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "戦略コンサル 面接", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 対策", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 解答例", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 例題", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 フレームワーク", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 売上向上", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 新規事業", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 因数分解", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 ロジックツリー", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 前提確認", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 市場規模", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "フェルミ推定 対策", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "フェルミ推定 例題", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "フェルミ推定", category: "面接対策", cvIntent: "MID" },
  { keyword: "AIケース面接", category: "面接対策", cvIntent: "HIGH" },
  { keyword: "ケース面接 ボロボロ", category: "面接対策", cvIntent: "MID" },
  { keyword: "ケース面接 ノー勉", category: "面接対策", cvIntent: "MID" },
  // 総合コンサル (参考)
  { keyword: "ベイカレント ケース面接", category: "戦略ファーム", firmType: "総合", cvIntent: "MID" },
  { keyword: "アクセンチュア ケース面接", category: "戦略ファーム", firmType: "総合", cvIntent: "MID" },
  { keyword: "デロイト ケース面接", category: "戦略ファーム", firmType: "総合", cvIntent: "MID" },
  { keyword: "アビーム ケース面接", category: "戦略ファーム", firmType: "総合", cvIntent: "MID" },
  { keyword: "PwC ケース面接", category: "戦略ファーム", firmType: "総合", cvIntent: "MID" },
  // 転職
  { keyword: "コンサル 転職 未経験", category: "転職", cvIntent: "HIGH" },
  { keyword: "コンサル 転職 対策", category: "転職", cvIntent: "HIGH" },
  { keyword: "戦略コンサル 転職", category: "転職", cvIntent: "HIGH" },
  // 業界理解
  { keyword: "戦略コンサル", category: "業界理解", cvIntent: "MID" },
  { keyword: "コンサル 激務", category: "業界理解", cvIntent: "LOW" },
];

function YouTubeKeywordAnalysis({ youtubeVideos, youtubeSearchTerms, trafficSources, searchQueries, adsKeywords }: KeywordAnalysisProps) {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterCoverage, setFilterCoverage] = useState<string>("all");

  // Build video map
  const videoMap = useMemo(() => {
    const m: Record<string, YouTubeVideo> = {};
    for (const v of youtubeVideos) m[v.video_id] = v;
    return m;
  }, [youtubeVideos]);

  // Build YT search term map: term -> { views, videoEntries }
  const ytTermMap = useMemo(() => {
    const m: Record<string, { totalViews: number; videos: { videoId: string; views: number }[] }> = {};
    for (const t of youtubeSearchTerms) {
      if (!m[t.search_term]) m[t.search_term] = { totalViews: 0, videos: [] };
      m[t.search_term].totalViews += t.views;
      m[t.search_term].videos.push({ videoId: t.video_id, views: t.views });
    }
    // Sort videos by views desc within each term
    for (const key of Object.keys(m)) {
      m[key].videos.sort((a, b) => b.views - a.views);
    }
    return m;
  }, [youtubeSearchTerms]);

  // Build YT_SEARCH traffic per video
  const ytSearchByVideo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of trafficSources) {
      if (t.source_type === "YT_SEARCH") m[t.video_id] = (m[t.video_id] || 0) + t.views;
    }
    return m;
  }, [trafficSources]);

  // Build SC aggregated map: query -> { clicks, impressions, avgPosition }
  const scMap = useMemo(() => {
    const m: Record<string, { clicks: number; impressions: number; positions: number[]; count: number }> = {};
    for (const r of searchQueries) {
      if (!r.query) continue;
      if (!m[r.query]) m[r.query] = { clicks: 0, impressions: 0, positions: [], count: 0 };
      m[r.query].clicks += r.clicks || 0;
      m[r.query].impressions += r.impressions || 0;
      if (r.position) m[r.query].positions.push(r.position);
      m[r.query].count++;
    }
    return m;
  }, [searchQueries]);

  // Build Ads aggregated map: keyword -> { clicks, impressions, cost, conversions }
  const adsMap = useMemo(() => {
    const m: Record<string, { clicks: number; impressions: number; cost: number; conversions: number }> = {};
    for (const r of adsKeywords) {
      if (!r.keyword) continue;
      if (!m[r.keyword]) m[r.keyword] = { clicks: 0, impressions: 0, cost: 0, conversions: 0 };
      m[r.keyword].clicks += r.clicks || 0;
      m[r.keyword].impressions += r.impressions || 0;
      m[r.keyword].cost += r.cost || 0;
      m[r.keyword].conversions += r.conversions || 0;
    }
    return m;
  }, [adsKeywords]);

  // For each attack keyword, find matching data
  const analysisRows = useMemo(() => {
    return ATTACK_KEYWORDS.map(ak => {
      // Find matching YT search terms (partial match)
      const kwLower = ak.keyword.toLowerCase();
      const matchingYtTerms: { term: string; views: number; topVideo: { videoId: string; views: number } | null }[] = [];
      for (const [term, data] of Object.entries(ytTermMap)) {
        if (term.toLowerCase().includes(kwLower) || kwLower.includes(term.toLowerCase())) {
          matchingYtTerms.push({
            term,
            views: data.totalViews,
            topVideo: data.videos[0] || null,
          });
        }
      }
      // Exact match first
      const exactYt = ytTermMap[ak.keyword];
      const ytSearchViews = exactYt?.totalViews || matchingYtTerms.reduce((s, t) => s + t.views, 0);
      const topVideo = exactYt?.videos[0] || matchingYtTerms[0]?.topVideo || null;
      const topVideoTitle = topVideo ? (videoMap[topVideo.videoId]?.title || "不明") : null;
      const topVideoViews = topVideo?.views || 0;
      const topVideoShare = ytSearchViews > 0 && topVideoViews > 0 ? Math.round((topVideoViews / ytSearchViews) * 100) : 0;

      // SC data - find matching queries
      let scImp = 0, scClicks = 0, scAvgPos: number | null = null;
      const scPositions: number[] = [];
      for (const [q, data] of Object.entries(scMap)) {
        if (q.toLowerCase().includes(kwLower) || kwLower.includes(q.toLowerCase())) {
          scImp += data.impressions;
          scClicks += data.clicks;
          scPositions.push(...data.positions);
        }
      }
      if (scPositions.length > 0) scAvgPos = Math.round((scPositions.reduce((a, b) => a + b, 0) / scPositions.length) * 10) / 10;

      // Ads data - find matching keywords
      let adsCv = 0, adsCost = 0;
      for (const [kw, data] of Object.entries(adsMap)) {
        if (kw.includes(ak.keyword) || ak.keyword.includes(kw)) {
          adsCv += data.conversions;
          adsCost += data.cost;
        }
      }

      // Determine coverage level
      let coverage: "上位" | "弱い" | "なし";
      if (ytSearchViews >= 100 && topVideoShare >= 20) {
        coverage = "上位";
      } else if (ytSearchViews > 0) {
        coverage = "弱い";
      } else {
        coverage = "なし";
      }

      return {
        ...ak,
        ytSearchViews,
        topVideoTitle,
        topVideoViews,
        topVideoShare,
        scImp,
        scClicks,
        scAvgPos,
        adsCv,
        adsCost,
        coverage,
      };
    });
  }, [ytTermMap, scMap, adsMap, videoMap]);

  // Stats
  const stats = useMemo(() => {
    const ranked = analysisRows.filter(r => r.coverage === "上位").length;
    const weak = analysisRows.filter(r => r.coverage === "弱い").length;
    const none = analysisRows.filter(r => r.coverage === "なし").length;
    const stratNone = analysisRows.filter(r => r.firmType === "戦略" && r.coverage === "なし").length;
    const totalAdsCv = analysisRows.reduce((s, r) => s + r.adsCv, 0);
    const uncoveredAdsCv = analysisRows.filter(r => r.coverage === "なし").reduce((s, r) => s + r.adsCv, 0);
    return { ranked, weak, none, stratNone, totalAdsCv, uncoveredAdsCv };
  }, [analysisRows]);

  // Filter
  const filtered = analysisRows.filter(r => {
    if (filterCategory !== "all" && r.category !== filterCategory) return false;
    if (filterCoverage === "上位" && r.coverage !== "上位") return false;
    if (filterCoverage === "未対応" && r.coverage !== "なし") return false;
    if (filterCoverage === "弱い" && r.coverage !== "弱い") return false;
    return true;
  });

  const categories = ["all", ...Array.from(new Set(ATTACK_KEYWORDS.map(k => k.category)))];

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-surface-raised border border-white/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.ranked}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">上位表示KW</p>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{stats.weak}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">弱い / 分散</p>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.none}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">未対応</p>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.stratNone}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">戦略ファーム未対応</p>
        </div>
      </div>

      {/* Insight box */}
      {stats.uncoveredAdsCv > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <p className="text-sm text-red-300">
            <span className="font-bold">未対応KWのAds CV計: {stats.uncoveredAdsCv.toFixed(1)}件</span> —
            これらのキーワードに対応する動画を作れば、広告費をかけずにCV獲得できる可能性
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex gap-1 items-center">
          <span className="text-xs text-gray-500 mr-1">カテゴリ:</span>
          {categories.map(c => (
            <button key={c} onClick={() => setFilterCategory(c)}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterCategory === c ? "bg-brand/20 text-brand" : "text-gray-400 hover:text-white"}`}>
              {c === "all" ? "全て" : c}
            </button>
          ))}
        </div>
        <div className="flex gap-1 items-center">
          <span className="text-xs text-gray-500 mr-1">カバレッジ:</span>
          {["all", "上位", "弱い", "未対応"].map(c => (
            <button key={c} onClick={() => setFilterCoverage(c)}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${filterCoverage === c ? "bg-brand/20 text-brand" : "text-gray-400 hover:text-white"}`}>
              {c === "all" ? "全て" : c}
            </button>
          ))}
        </div>
      </div>

      {/* Priority-ranked action list */}
      <div className="space-y-2">
        {filtered
          .map(row => {
            // Priority scoring
            let score = 0;
            const reasons: string[] = [];

            // CV intent weight
            if (row.cvIntent === "HIGH") { score += 30; reasons.push("CV意図が高い"); }
            else if (row.cvIntent === "MID") { score += 15; }

            // Coverage gap = opportunity
            if (row.coverage === "なし") { score += 25; reasons.push("動画が未対応"); }
            else if (row.coverage === "弱い") { score += 15; reasons.push("検索流入が分散/少量"); }

            // Ads CV = proven demand
            if (row.adsCv >= 1) { score += 20; reasons.push(`Ads実績CV ${row.adsCv.toFixed(1)}件（広告費¥${Math.round(row.adsCost).toLocaleString()}）`); }

            // SC search volume
            if (row.scImp >= 500) { score += 10; reasons.push(`Web検索imp ${row.scImp.toLocaleString()}`); }
            else if (row.scImp >= 100) { score += 5; }

            // Strategic firm keyword
            if (row.firmType === "戦略") { score += 5; reasons.push("戦略ファーム名KW"); }

            const action = row.coverage === "なし"
              ? "新規動画を作成"
              : row.coverage === "弱い"
                ? "既存動画のSEO改善 or 新規動画追加"
                : "現状維持（上位表示済み）";

            return { ...row, score, reasons, action };
          })
          .sort((a, b) => b.score - a.score)
          .map((row, i) => {
            const priorityColor = row.score >= 50 ? "border-l-red-500 bg-red-500/5" : row.score >= 30 ? "border-l-yellow-500 bg-yellow-500/5" : "border-l-gray-600";
            const priorityLabel = row.score >= 50 ? "高" : row.score >= 30 ? "中" : "低";
            const priorityBadge = row.score >= 50 ? "bg-red-500/20 text-red-300" : row.score >= 30 ? "bg-yellow-500/20 text-yellow-300" : "bg-gray-500/20 text-gray-400";

            return (
              <div key={i} className={`border-l-2 ${priorityColor} rounded-r-lg p-3 hover:bg-white/5 transition-colors`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${priorityBadge}`}>
                        {priorityLabel}
                      </span>
                      <span className="text-sm font-medium text-white">{row.keyword}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        row.coverage === "上位" ? "bg-green-500/20 text-green-300" : row.coverage === "弱い" ? "bg-yellow-500/20 text-yellow-300" : "bg-red-500/20 text-red-300"
                      }`}>{row.coverage}</span>
                      {row.firmType && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300">{row.firmType}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mb-1">
                      <span className="text-gray-300 font-medium">アクション:</span> {row.action}
                    </p>
                    {row.reasons.length > 0 && (
                      <p className="text-[10px] text-gray-500">
                        理由: {row.reasons.join(" / ")}
                      </p>
                    )}
                    {row.topVideoTitle && (
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        現在の#1動画: {row.topVideoTitle} ({row.ytSearchViews.toLocaleString()}検索流入, シェア{row.topVideoShare}%)
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-lg font-bold text-gray-400">{row.score}</p>
                    <p className="text-[9px] text-gray-600">スコア</p>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
