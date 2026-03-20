"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ───── Types ───── */

export interface YouTubeWeeklyVideoData {
  weekKey: string;
  videoBreakdown: Record<string, number>;
}

export interface YouTubeVideoInfo {
  video_id: string;
  title: string;
  is_short?: boolean;
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
const VIDEO_COLORS = ["#FF0000", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#DDA0DD", "#F0E68C"];
const OTHER_COLOR = "#4B5563";
const TOP_N = 7;
const LTV_COLORS = {
  school_kisotsu: "#3B82F6",
  subsidy: "#10B981",
  agent_fee: "#F59E0B",
  shinsotsu: "#A78BFA",
};

type ViewMode = "views" | "minutes";

function yAxisFmt(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(0)}万`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}千`;
  return String(v);
}

function formatMonth(v: string): string {
  const parts = v.split("-");
  return parts[0] + "年" + parseInt(parts[1]) + "月";
}

/* ───── Tooltip Components (outside main component to avoid SWC issues) ───── */

function makeVideoTooltip(shortTitleFn: (id: string) => string, unit: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function VideoTooltipInner({ active, payload, label }: any) {
    if (!active || !payload || payload.length === 0) return null;
    const sorted = [...payload].sort((a: { value: number }, b: { value: number }) => (b.value || 0) - (a.value || 0));
    const total = sorted.reduce((s: number, p: { value: number }) => s + (p.value || 0), 0);
    return (
      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs max-w-xs">
        <p className="text-gray-400 mb-1.5">{label}</p>
        {sorted.map((entry: { dataKey: string; value: number; color: string }, i: number) => {
          if (!entry.value || entry.value === 0) return null;
          const name = entry.dataKey === "others" ? "その他" : shortTitleFn(entry.dataKey);
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LTVTooltipComponent({ active, payload, label, ltvMonthly }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const monthData = ltvMonthly.find((m: YouTubeLTVMonthlyRow) => m.month === label);
  const total = (payload as { value: number }[]).reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs max-w-xs">
      <p className="text-gray-400 mb-1.5">{label}</p>
      {payload.map((entry: { dataKey: string; value: number; color: string }, i: number) => {
        if (!entry.value || entry.value === 0) return null;
        const labels: Record<string, string> = { school_kisotsu: "確定売上(既卒)", subsidy: "補助金", agent_fee: "人材見込", shinsotsu: "新卒" };
        return (
          <div key={i} className="flex items-center justify-between gap-3 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-300">{labels[entry.dataKey] || entry.dataKey}</span>
            </div>
            <span className="text-white font-medium">¥{(entry.value / 10000).toFixed(1)}万</span>
          </div>
        );
      })}
      <div className="border-t border-white/10 mt-1 pt-1 flex justify-between">
        <span className="text-gray-400">合計</span>
        <span className="text-white font-bold">¥{(total / 10000).toFixed(1)}万</span>
      </div>
      {monthData && monthData.customers.length > 0 && (
        <div className="border-t border-white/10 mt-1.5 pt-1.5">
          <p className="text-gray-500 text-[10px] mb-1">成約顧客:</p>
          {monthData.customers.map((c: { name: string; ltv: number }, i: number) => (
            <div key={i} className="flex justify-between gap-2 py-0.5 text-[10px]">
              <span className="text-gray-300 truncate">{c.name}</span>
              <span className="text-white whitespace-nowrap">¥{(c.ltv / 10000).toFixed(1)}万</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── Main Component ───── */

export function YouTubeDashboardClient({ weeklyViews, weeklyMinutes, videoInfoMap, ltvMonthly }: YouTubeChartsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("views");
  const [includeShorts, setIncludeShorts] = useState(true);

  const titleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of videoInfoMap) m.set(v.video_id, v.title);
    return m;
  }, [videoInfoMap]);

  const shortIds = useMemo(() => {
    const ids: string[] = [];
    for (const v of videoInfoMap) {
      if (v.is_short) ids.push(v.video_id);
    }
    return new Set(ids);
  }, [videoInfoMap]);

  const hasShorts = shortIds.size > 0;

  const shortTitle = (videoId: string): string => {
    const title = titleMap.get(videoId) || videoId;
    return title.length > 20 ? title.slice(0, 18) + "..." : title;
  };

  // 選択中のデータ（ショートフィルタ適用）
  const srcData = viewMode === "views" ? weeklyViews : weeklyMinutes;
  const weeklyData = useMemo(() => {
    if (includeShorts || !hasShorts) return srcData;
    return srcData.map(w => {
      const bd: Record<string, number> = {};
      for (const k of Object.keys(w.videoBreakdown)) {
        if (!shortIds.has(k)) bd[k] = w.videoBreakdown[k];
      }
      return { weekKey: w.weekKey, videoBreakdown: bd };
    });
  }, [srcData, includeShorts, hasShorts, shortIds]);

  const unit = viewMode === "views" ? "回" : "分";

  // 週ごとのトップN
  const { chartData, topVideoIds } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const w of weeklyData) {
      for (const [vid, count] of Object.entries(w.videoBreakdown)) {
        totals.set(vid, (totals.get(vid) || 0) + count);
      }
    }
    const topIds = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map(([id]) => id);
    const topSet = new Set(topIds);

    const data = weeklyData.map(w => {
      const row: Record<string, number | string> = { week: w.weekKey };
      let others = 0;
      for (const [vid, count] of Object.entries(w.videoBreakdown)) {
        if (topSet.has(vid)) {
          row[vid] = count;
        } else {
          others += count;
        }
      }
      row["others"] = others;
      return row;
    });

    return { chartData: data, topVideoIds: topIds };
  }, [weeklyData]);

  const VideoTooltip = useMemo(() => makeVideoTooltip(shortTitle, unit), [unit]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LTVTooltip = useMemo(() => {
    return function LTVWrapper(props: any) {
      return <LTVTooltipComponent {...props} ltvMonthly={ltvMonthly} />;
    };
  }, [ltvMonthly]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 左: YouTube視聴推移 */}
      <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-200">YouTube 視聴推移</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">週ごとのトップ{TOP_N}動画 + その他</p>
          </div>
          <div className="flex items-center gap-2">
            {hasShorts && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={includeShorts} onChange={() => setIncludeShorts(!includeShorts)}
                  className="w-3 h-3 rounded border-gray-600 bg-white/5 text-brand focus:ring-brand focus:ring-offset-0" />
                <span className="text-[10px] text-gray-400">ショート含む</span>
              </label>
            )}
            <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
              <button onClick={() => setViewMode("views")}
                className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${viewMode === "views" ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                視聴回数
              </button>
              <button onClick={() => setViewMode("minutes")}
                className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${viewMode === "minutes" ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                視聴時間
              </button>
            </div>
          </div>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} stackOffset="none">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#6b7280" }}
                tickFormatter={(v: string) => `${parseInt(v.slice(5, 7))}/${v.slice(8, 10)}`}
                interval={Math.max(0, Math.floor(chartData.length / 12))} />
              <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={yAxisFmt} />
              <Tooltip content={<VideoTooltip />} />
              {topVideoIds.map((vid, i) => (
                <Bar key={vid} dataKey={vid} stackId="main" fill={VIDEO_COLORS[i % VIDEO_COLORS.length]} name={shortTitle(vid)} />
              ))}
              <Bar dataKey="others" stackId="main" fill={OTHER_COLOR} name="その他" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2 px-1">
            {topVideoIds.slice(0, TOP_N).map((vid, i) => (
              <div key={vid} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: VIDEO_COLORS[i % VIDEO_COLORS.length] }} />
                <span className="text-[9px] text-gray-400 truncate max-w-[100px]">{shortTitle(vid)}</span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: OTHER_COLOR }} />
              <span className="text-[9px] text-gray-400">その他</span>
            </div>
          </div>
        </div>
      </div>

      {/* 右: YouTube経由 成約LTV推移 */}
      <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-200">YouTube経由 成約LTV推移</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">確定売上(既卒) / 補助金 / 人材見込 / 新卒</p>
        </div>
        <div className="p-4">
          {ltvMonthly.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ltvMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#6b7280" }}
                    tickFormatter={formatMonth} />
                  <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={yAxisFmt} />
                  <Tooltip content={<LTVTooltip />} />
                  <Bar dataKey="school_kisotsu" name="確定売上(既卒)" stackId="ltv" fill={LTV_COLORS.school_kisotsu} />
                  <Bar dataKey="subsidy" name="補助金" stackId="ltv" fill={LTV_COLORS.subsidy} />
                  <Bar dataKey="agent_fee" name="人材見込" stackId="ltv" fill={LTV_COLORS.agent_fee} />
                  <Bar dataKey="shinsotsu" name="新卒" stackId="ltv" fill={LTV_COLORS.shinsotsu} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2 px-1">
                {[
                  { label: "確定売上(既卒)", color: LTV_COLORS.school_kisotsu },
                  { label: "補助金", color: LTV_COLORS.subsidy },
                  { label: "人材見込", color: LTV_COLORS.agent_fee },
                  { label: "新卒", color: LTV_COLORS.shinsotsu },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] text-gray-400">{item.label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-500 text-center py-12">YouTube経由の成約データなし</p>
          )}
        </div>
      </div>
    </div>
  );
}
