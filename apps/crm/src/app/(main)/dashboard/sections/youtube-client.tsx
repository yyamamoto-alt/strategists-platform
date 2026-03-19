"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

/* ───── Types ───── */

export interface YouTubeWeeklyVideoData {
  weekKey: string;
  videoBreakdown: Record<string, number>; // video_id -> views or minutes
}

export interface YouTubeVideoInfo {
  video_id: string;
  title: string;
}

export interface YouTubeLTVMonthlyRow {
  month: string;
  school_kisotsu: number;
  subsidy: number;
  agent_fee: number;
  shinsotsu: number;
  customers: { name: string; ltv: number }[];
}

interface YouTubeChartsProps {
  weeklyViews: YouTubeWeeklyVideoData[];
  weeklyMinutes: YouTubeWeeklyVideoData[];
  videoInfoMap: YouTubeVideoInfo[];
  ltvMonthly: YouTubeLTVMonthlyRow[];
}

/* ───── Colors ───── */
const VIDEO_COLORS = ["#FF0000", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4"];
const OTHER_COLOR = "#4B5563";
const LTV_COLORS = {
  school_kisotsu: "#3B82F6",
  subsidy: "#10B981",
  agent_fee: "#F59E0B",
  shinsotsu: "#A78BFA",
};

function yAxisFmt(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(0)}万`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}千`;
  return String(v);
}

/* ───── Main Component ───── */

export function YouTubeDashboardClient({ weeklyViews, weeklyMinutes, videoInfoMap, ltvMonthly }: YouTubeChartsProps) {
  // Build title map
  const titleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of videoInfoMap) m.set(v.video_id, v.title);
    return m;
  }, [videoInfoMap]);

  // Determine top 5 videos by total views
  const top5ViewIds = useMemo(() => {
    const totals = new Map<string, number>();
    for (const w of weeklyViews) {
      for (const [vid, count] of Object.entries(w.videoBreakdown)) {
        totals.set(vid, (totals.get(vid) || 0) + count);
      }
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
  }, [weeklyViews]);

  // Top 5 by minutes
  const top5MinuteIds = useMemo(() => {
    const totals = new Map<string, number>();
    for (const w of weeklyMinutes) {
      for (const [vid, count] of Object.entries(w.videoBreakdown)) {
        totals.set(vid, (totals.get(vid) || 0) + count);
      }
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
  }, [weeklyMinutes]);

  // Build chart data for views
  const viewsChartData = useMemo(() => {
    return weeklyViews.map(w => {
      const row: Record<string, number | string> = { week: w.weekKey };
      let others = 0;
      for (const [vid, count] of Object.entries(w.videoBreakdown)) {
        if (top5ViewIds.includes(vid)) {
          row[vid] = count;
        } else {
          others += count;
        }
      }
      row["others"] = others;
      return row;
    });
  }, [weeklyViews, top5ViewIds]);

  // Build chart data for minutes
  const minutesChartData = useMemo(() => {
    return weeklyMinutes.map(w => {
      const row: Record<string, number | string> = { week: w.weekKey };
      let others = 0;
      for (const [vid, count] of Object.entries(w.videoBreakdown)) {
        if (top5MinuteIds.includes(vid)) {
          row[vid] = count;
        } else {
          others += count;
        }
      }
      row["others"] = others;
      return row;
    });
  }, [weeklyMinutes, top5MinuteIds]);

  // Short title helper
  const shortTitle = (videoId: string): string => {
    const title = titleMap.get(videoId) || videoId;
    return title.length > 20 ? title.slice(0, 18) + "..." : title;
  };

  // Custom tooltip for video stacked bars
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const VideoTooltip = ({ active, payload, label, topIds, unit }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    // Sort by value descending
    const sorted = [...payload].sort((a: { value: number }, b: { value: number }) => (b.value || 0) - (a.value || 0));
    const total = sorted.reduce((s: number, p: { value: number }) => s + (p.value || 0), 0);
    return (
      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs max-w-xs">
        <p className="text-gray-400 mb-1.5">{label}</p>
        {sorted.map((entry: { dataKey: string; value: number; color: string }, i: number) => {
          if (!entry.value || entry.value === 0) return null;
          const name = entry.dataKey === "others" ? "その他" : shortTitle(entry.dataKey);
          return (
            <div key={i} className="flex items-center justify-between gap-3 py-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                <span className="text-gray-300 truncate">{name}</span>
              </div>
              <span className="text-white font-medium whitespace-nowrap">
                {Math.round(entry.value).toLocaleString()}{unit}
              </span>
            </div>
          );
        })}
        <div className="border-t border-white/10 mt-1 pt-1 flex justify-between">
          <span className="text-gray-400">合計</span>
          <span className="text-white font-bold">{Math.round(total).toLocaleString()}{unit}</span>
        </div>
      </div>
    );
  };

  // LTV tooltip
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LTVTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const monthData = ltvMonthly.find(m => m.month === label);
    const total = (payload as { value: number }[]).reduce((s, p) => s + (p.value || 0), 0);
    return (
      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs max-w-xs">
        <p className="text-gray-400 mb-1.5">{label}</p>
        {payload.map((entry: { dataKey: string; value: number; color: string }, i: number) => {
          if (!entry.value || entry.value === 0) return null;
          const labels: Record<string, string> = {
            school_kisotsu: "確定売上(既卒)",
            subsidy: "補助金",
            agent_fee: "人材見込",
            shinsotsu: "新卒",
          };
          return (
            <div key={i} className="flex items-center justify-between gap-3 py-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                <span className="text-gray-300">{labels[entry.dataKey] || entry.dataKey}</span>
              </div>
              <span className="text-white font-medium">
                {entry.value >= 10000
                  ? `¥${(entry.value / 10000).toFixed(1)}万`
                  : `¥${Math.round(entry.value).toLocaleString()}`}
              </span>
            </div>
          );
        })}
        <div className="border-t border-white/10 mt-1 pt-1 flex justify-between">
          <span className="text-gray-400">合計</span>
          <span className="text-white font-bold">
            {total >= 10000
              ? `¥${(total / 10000).toFixed(1)}万`
              : `¥${Math.round(total).toLocaleString()}`}
          </span>
        </div>
        {monthData && monthData.customers.length > 0 && (
          <div className="border-t border-white/10 mt-1.5 pt-1.5">
            <p className="text-gray-500 text-[10px] mb-1">成約顧客:</p>
            {monthData.customers.map((c, i) => (
              <div key={i} className="flex justify-between gap-2 py-0.5 text-[10px]">
                <span className="text-gray-300 truncate">{c.name}</span>
                <span className="text-white whitespace-nowrap">
                  {c.ltv >= 10000
                    ? `¥${(c.ltv / 10000).toFixed(1)}万`
                    : `¥${Math.round(c.ltv).toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Task 1: 視聴数・視聴時間推移 */}
      <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-200">YouTube 動画別 視聴推移</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">上位5動画 + その他（週次）</p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 視聴回数推移 */}
            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-3">視聴回数推移</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={viewsChartData} stackOffset="none">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 9, fill: "#6b7280" }}
                    tickFormatter={(v: string) => {
                      const m = v.slice(5, 7);
                      const d = v.slice(8, 10);
                      return `${parseInt(m)}/${d}`;
                    }}
                    interval={Math.max(0, Math.floor(viewsChartData.length / 12))}
                  />
                  <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={yAxisFmt} />
                  <Tooltip content={<VideoTooltip topIds={top5ViewIds} unit="回" />} />
                  {top5ViewIds.map((vid, i) => (
                    <Bar key={vid} dataKey={vid} stackId="views" fill={VIDEO_COLORS[i]} name={shortTitle(vid)} />
                  ))}
                  <Bar dataKey="others" stackId="views" fill={OTHER_COLOR} name="その他" />
                </BarChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex flex-wrap gap-2 mt-2 px-1">
                {top5ViewIds.map((vid, i) => (
                  <div key={vid} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: VIDEO_COLORS[i] }} />
                    <span className="text-[9px] text-gray-400 truncate max-w-[120px]">{shortTitle(vid)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: OTHER_COLOR }} />
                  <span className="text-[9px] text-gray-400">その他</span>
                </div>
              </div>
            </div>

            {/* 視聴時間推移 */}
            <div>
              <h4 className="text-xs font-medium text-gray-300 mb-3">視聴時間推移（分）</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={minutesChartData} stackOffset="none">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 9, fill: "#6b7280" }}
                    tickFormatter={(v: string) => {
                      const m = v.slice(5, 7);
                      const d = v.slice(8, 10);
                      return `${parseInt(m)}/${d}`;
                    }}
                    interval={Math.max(0, Math.floor(minutesChartData.length / 12))}
                  />
                  <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={yAxisFmt} />
                  <Tooltip content={<VideoTooltip topIds={top5MinuteIds} unit="分" />} />
                  {top5MinuteIds.map((vid, i) => (
                    <Bar key={vid} dataKey={vid} stackId="minutes" fill={VIDEO_COLORS[i]} name={shortTitle(vid)} />
                  ))}
                  <Bar dataKey="others" stackId="minutes" fill={OTHER_COLOR} name="その他" />
                </BarChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex flex-wrap gap-2 mt-2 px-1">
                {top5MinuteIds.map((vid, i) => (
                  <div key={vid} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: VIDEO_COLORS[i] }} />
                    <span className="text-[9px] text-gray-400 truncate max-w-[120px]">{shortTitle(vid)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: OTHER_COLOR }} />
                  <span className="text-[9px] text-gray-400">その他</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task 2: YouTube経由 成約LTV積上棒グラフ */}
      {ltvMonthly.length > 0 && (
        <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h3 className="text-sm font-medium text-gray-200">YouTube経由 成約LTV推移</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">月別 4カテゴリ積み上げ（確定売上・補助金・人材見込・新卒）</p>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ltvMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 9, fill: "#6b7280" }}
                  tickFormatter={(v: string) => {
                    const parts = v.split("-");
                    return `${parts[0].slice(2)}/${parseInt(parts[1])}`;
                  }}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#6b7280" }}
                  tickFormatter={(v: number) => {
                    if (v >= 10000) return `${(v / 10000).toFixed(0)}万`;
                    if (v >= 1000) return `${(v / 1000).toFixed(0)}千`;
                    return String(v);
                  }}
                />
                <Tooltip content={<LTVTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 10 }}
                  formatter={(value: string) => {
                    const labels: Record<string, string> = {
                      school_kisotsu: "確定売上(既卒)",
                      subsidy: "補助金",
                      agent_fee: "人材見込",
                      shinsotsu: "新卒",
                    };
                    return labels[value] || value;
                  }}
                />
                <Bar dataKey="school_kisotsu" stackId="ltv" fill={LTV_COLORS.school_kisotsu} name="school_kisotsu" radius={[0, 0, 0, 0]} />
                <Bar dataKey="subsidy" stackId="ltv" fill={LTV_COLORS.subsidy} name="subsidy" />
                <Bar dataKey="agent_fee" stackId="ltv" fill={LTV_COLORS.agent_fee} name="agent_fee" />
                <Bar dataKey="shinsotsu" stackId="ltv" fill={LTV_COLORS.shinsotsu} name="shinsotsu" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
