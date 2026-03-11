"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type {
  YouTubeVideo,
  YouTubeDaily,
  YouTubeChannelDaily,
  YouTubeFunnelCustomer,
} from "@/lib/data/analytics";

/* ───── Types ───── */
type YouTubeSub = "videos" | "customers";
type ChartGranularity = "daily" | "weekly" | "monthly";

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
  return video.duration_seconds <= 60;
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
}

export function YouTubeTab({ youtubeVideos, youtubeDaily, youtubeChannelDaily, youtubeFunnel }: YouTubeTabProps) {
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
        <SubTab label="成約顧客リスト" active={sub === "customers"} onClick={() => setSub("customers")} />
      </div>
      {sub === "videos" && <YouTubeVideoTable youtubeVideos={youtubeVideos} youtubeDaily={youtubeDaily} channelDaily={youtubeChannelDaily} />}
      {sub === "customers" && <YouTubeClosedCustomersTab youtubeFunnel={youtubeFunnel} youtubeVideos={youtubeVideos} />}
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
      {pct > 0 ? "+" : ""}{pct.toFixed(0)}% vs 前月同期
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

  const filteredVideos = useMemo(() =>
    includeShorts ? youtubeVideos : youtubeVideos.filter(v => !isShort(v)),
  [youtubeVideos, includeShorts]);

  const filteredVideoIds = useMemo(() => new Set(filteredVideos.map(v => v.video_id)), [filteredVideos]);

  // KPIs
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

    const latestSubs = channelDaily.length > 0 ? channelDaily[channelDaily.length - 1].total_subscribers : 0;

    return {
      views: { current: curViews, prev: prevViews },
      minutes: { current: curMinutes, prev: prevMinutes },
      subNet: { current: curSubGain - curSubLost, prev: prevSubGain - prevSubLost },
      totalSubs: latestSubs,
      totalVideos: youtubeVideos.length,
    };
  }, [channelDaily, youtubeVideos]);

  // Chart data with granularity
  const viewsChartData = useMemo(() =>
    aggregateByGranularity(channelDaily, chartGranularity, items => ({
      total_views: items.reduce((s, r) => s + r.total_views, 0),
    })),
  [channelDaily, chartGranularity]);

  const minutesChartData = useMemo(() =>
    aggregateByGranularity(channelDaily, chartGranularity, items => ({
      estimated_minutes_watched: items.reduce((s, r) => s + r.estimated_minutes_watched, 0),
    })),
  [channelDaily, chartGranularity]);

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
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [youtubeVideos]);

  // Monthly heatmap data
  const { videoRows, monthKeys, maxMonthViews } = useMemo(() => {
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

    const mKeys = Array.from(allMonths).sort();

    const rows = filteredVideos
      .map(v => {
        const months = monthMap.get(v.video_id) || new Map<string, number>();
        const totalFromDaily = Array.from(months.values()).reduce((s, x) => s + x, 0);
        return {
          video: v,
          totalViews: v.total_views || totalFromDaily,
          months,
        };
      })
      .sort((a, b) => b.totalViews - a.totalViews);

    let maxV = 0;
    for (const r of rows) for (const v of r.months.values()) if (v > maxV) maxV = v;

    return { videoRows: rows, monthKeys: mKeys, maxMonthViews: maxV };
  }, [youtubeDaily, filteredVideos, filteredVideoIds]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard title="今月の視聴数" value={kpis.views.current.toLocaleString()} sub={kpiChange(kpis.views.current, kpis.views.prev)} />
        <KpiCard title="視聴時間(時間)" value={`${(kpis.minutes.current / 60).toFixed(1)}h`} sub={kpiChange(kpis.minutes.current, kpis.minutes.prev)} />
        <KpiCard title="登録者純増" value={kpis.subNet.current >= 0 ? `+${kpis.subNet.current}` : String(kpis.subNet.current)} sub={kpiChange(kpis.subNet.current, kpis.subNet.prev)} />
        <KpiCard title="総登録者数" value={kpis.totalSubs.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">現在</span>} />
        <KpiCard title="動画数" value={String(kpis.totalVideos)} sub={<span className="text-gray-500 text-[10px]">公開中</span>} />
      </div>

      {/* Charts with granularity switcher */}
      <div className="flex justify-end">
        <GranularitySelector value={chartGranularity} onChange={setChartGranularity} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">視聴数推移</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={viewsChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="key" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v: string) => v.slice(5)} interval={chartGranularity === "daily" ? 6 : 0} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#9ca3af" }} />
              <Line type="monotone" dataKey="total_views" name="視聴数" stroke="#ef4444" strokeWidth={2} dot={chartGranularity !== "daily"} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">視聴時間推移（分）</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={minutesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="key" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v: string) => v.slice(5)} interval={chartGranularity === "daily" ? 6 : 0} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#9ca3af" }} />
              <Line type="monotone" dataKey="estimated_minutes_watched" name="視聴時間(分)" stroke="#f59e0b" strokeWidth={2} dot={chartGranularity !== "daily"} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly publish count */}
      {publishData.length > 1 && (
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">月別動画投稿数</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={publishData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#9ca3af" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" name="通常動画" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="shorts" name="ショート" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

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
                  <th className="text-right py-2.5 px-3 w-20">総再生回数</th>
                  {monthKeys.map(mk => (
                    <th key={mk} className="text-center py-2.5 px-1 w-16 whitespace-nowrap text-[10px]">
                      {mk.replace("-", "/")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {videoRows.slice(0, 100).map((row, idx) => (
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
                            <span className="text-[10px] text-gray-600">{row.video.published_at.slice(0, 10)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right py-2 px-3 text-white font-bold text-sm">{row.totalViews.toLocaleString()}</td>
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
                {videoRows.length === 0 && <tr><td colSpan={3 + monthKeys.length} className="py-8 text-center text-gray-500">データなし</td></tr>}
              </tbody>
            </table>
          </div>
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

  const totalLTV = useMemo(() =>
    closedCustomers.reduce((s, c) => s + c.confirmed_amount + c.expected_referral_fee + c.subsidy_amount, 0),
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
                const ltv = c.confirmed_amount + c.expected_referral_fee + c.subsidy_amount;
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
                      {c.expected_referral_fee > 0 ? (
                        <span className="text-amber-300">¥{Math.round(c.expected_referral_fee).toLocaleString()}</span>
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
