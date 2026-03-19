"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { ChannelTrend, ChannelMonthlyRaw } from "@/lib/data/dashboard-metrics";

const CHANNEL_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
  "#14b8a6", "#e11d48", "#a855f7", "#0ea5e9", "#facc15",
];

const GRAY = "#3f3f46"; // グレーアウト用

/** 属性文字列から卒年を抽出（"27卒" → "27卒", "既卒・中途" → null） */
function extractGradYear(attr: string): string | null {
  const m = attr.match(/(\d{2})卒/);
  return m ? `${m[1]}卒` : null;
}

function useChannelChartData(
  data: ChannelMonthlyRaw[],
  attrFilter: "kisotsu" | "shinsotsu",
  metricFilter: "application" | "closed",
) {
  return useMemo(() => {
    const filtered = attrFilter === "kisotsu"
      ? data.filter(d => !d.isShinsotsu)
      : data.filter(d => d.isShinsotsu);

    const records = metricFilter === "closed" ? filtered.filter(d => d.isClosed) : filtered;

    const channelTotals = new Map<string, number>();
    for (const d of records) channelTotals.set(d.channel, (channelTotals.get(d.channel) || 0) + 1);

    const majorChannels = new Set<string>();
    for (const [ch, count] of channelTotals) { if (count > 3) majorChannels.add(ch); }

    const now = new Date();
    const months: string[] = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const names = Array.from(majorChannels).sort((a, b) => (channelTotals.get(b) || 0) - (channelTotals.get(a) || 0));
    if (records.some(d => !majorChannels.has(d.channel))) names.push("その他");

    return { records, months, channelNames: names, majorChannels, total: records.length };
  }, [data, attrFilter, metricFilter]);
}

/** 既卒チャネルグラフ（卒年フィルタなし） */
export function ChannelChartItem({
  data,
  attrFilter,
  metricFilter,
  title,
}: {
  data: ChannelMonthlyRaw[];
  attrFilter: "kisotsu" | "shinsotsu";
  metricFilter: "application" | "closed";
  title: string;
}) {
  const { records, months, channelNames, majorChannels, total } = useChannelChartData(data, attrFilter, metricFilter);

  const chartData = useMemo(() => {
    const monthMap = new Map<string, Record<string, number>>();
    for (const m of months) monthMap.set(m, {});
    for (const d of records) {
      const ch = majorChannels.has(d.channel) ? d.channel : "その他";
      const bucket = monthMap.get(d.month);
      if (bucket) bucket[ch] = (bucket[ch] || 0) + 1;
    }
    return months.map(m => {
      const row: Record<string, string | number> = { month: m };
      const bucket = monthMap.get(m) || {};
      for (const ch of channelNames) row[ch] = bucket[ch] || 0;
      return row;
    });
  }, [records, months, channelNames, majorChannels]);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-white">{title}</h3>
        <span className="text-sm font-bold text-white">{total}<span className="text-[10px] text-gray-400 ml-1">件</span></span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fontSize: 8, fill: "#6b7280" }} tickFormatter={(v: string) => v.slice(5)} interval={2} />
          <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} allowDecimals={false} width={25} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: "#e5e7eb", fontWeight: 600 }}
            formatter={(value, name) => { const v = Number(value); return v === 0 ? [null, null] : [`${name}: ${v}件`]; }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            itemSorter={(item: any) => -(item.value || 0)}
          />
          <Legend wrapperStyle={{ fontSize: 9 }} />
          {channelNames.map((name, i) => (
            <Bar key={name} dataKey={name} stackId="main" fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 新卒チャネルグラフ（卒年フィルタ付き） */
export function ShinsotsuChannelChartItem({
  data,
  metricFilter,
  title,
}: {
  data: ChannelMonthlyRaw[];
  metricFilter: "application" | "closed";
  title: string;
}) {
  // 利用可能な卒年を抽出
  const gradYears = useMemo(() => {
    const years = new Set<string>();
    for (const d of data) {
      if (!d.isShinsotsu) continue;
      const gy = extractGradYear(d.attribute);
      if (gy) years.add(gy);
    }
    return Array.from(years).sort().reverse(); // 28卒, 27卒, 26卒...
  }, [data]);

  const [selectedYear, setSelectedYear] = useState<string | null>(null); // null = 全体

  const { records, months, channelNames, majorChannels, total } = useChannelChartData(data, "shinsotsu", metricFilter);

  // 選択された卒年のレコードとそれ以外を分離
  const chartData = useMemo(() => {
    const monthMapActive = new Map<string, Record<string, number>>();
    const monthMapGray = new Map<string, Record<string, number>>();
    for (const m of months) { monthMapActive.set(m, {}); monthMapGray.set(m, {}); }

    for (const d of records) {
      const ch = majorChannels.has(d.channel) ? d.channel : "その他";
      const gy = extractGradYear(d.attribute);
      const isActive = !selectedYear || gy === selectedYear;
      const bucket = (isActive ? monthMapActive : monthMapGray).get(d.month);
      if (bucket) bucket[ch] = (bucket[ch] || 0) + 1;
    }

    return months.map(m => {
      const row: Record<string, string | number> = { month: m };
      const active = monthMapActive.get(m) || {};
      const gray = monthMapGray.get(m) || {};
      for (const ch of channelNames) {
        row[ch] = active[ch] || 0;
        row[`${ch}_gray`] = gray[ch] || 0;
      }
      return row;
    });
  }, [records, months, channelNames, majorChannels, selectedYear]);

  // 選択卒年の件数
  const activeTotal = useMemo(() => {
    if (!selectedYear) return total;
    return records.filter(d => extractGradYear(d.attribute) === selectedYear).length;
  }, [records, selectedYear, total]);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{activeTotal}<span className="text-[10px] text-gray-400 ml-1">件</span></span>
          {gradYears.length > 0 && (
            <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
              <button onClick={() => setSelectedYear(null)}
                className={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${!selectedYear ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                全体
              </button>
              {gradYears.map(gy => (
                <button key={gy} onClick={() => setSelectedYear(gy)}
                  className={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${selectedYear === gy ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                  {gy}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fontSize: 8, fill: "#6b7280" }} tickFormatter={(v: string) => v.slice(5)} interval={2} />
          <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} allowDecimals={false} width={25} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: "#e5e7eb", fontWeight: 600 }}
            formatter={(value, name) => {
              const v = Number(value);
              if (v === 0) return [null, null];
              const displayName = String(name).replace(/_gray$/, "");
              const suffix = String(name).endsWith("_gray") ? "(その他卒年)" : "";
              return [`${displayName}${suffix}: ${v}件`];
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            itemSorter={(item: any) => -(item.value || 0)}
          />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Legend wrapperStyle={{ fontSize: 9 }} {...{ payload: channelNames.map((name, i) => ({ value: name, type: "square", color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] })) } as any} />
          {/* グレーアウト（非選択卒年） */}
          {selectedYear && channelNames.map((name) => (
            <Bar key={`${name}_gray`} dataKey={`${name}_gray`} stackId="gray" fill={GRAY} fillOpacity={0.3} legendType="none" />
          ))}
          {/* アクティブ（選択卒年 or 全体） */}
          {channelNames.map((name, i) => (
            <Bar key={name} dataKey={name} stackId="main" fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** チャネル別申込推移バッジ */
export function ChannelTrendItem({ channelTrends }: { channelTrends: ChannelTrend[] }) {
  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-white">チャネル別申込推移</h2>
        <p className="text-[10px] text-gray-500">直近1ヶ月 vs 前2ヶ月（月平均）</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {channelTrends.map((t) => (
          <div key={t.channel}
            className={`rounded border px-2 py-1.5 flex items-center gap-2 ${
              t.trend === "up" ? "border-green-500/30 bg-green-500/5"
              : t.trend === "down" ? "border-red-500/30 bg-red-500/5"
              : "border-white/10 bg-white/[0.02]"
            }`}>
            <span className="text-[11px] text-gray-300">{t.channel}</span>
            <span className="text-sm font-bold text-white">{t.recentCount}</span>
            <span className="text-[10px] text-gray-500">/ {t.baselineMonthlyRate}</span>
            {t.trendPct !== 0 && (
              <span className={`text-[11px] font-semibold ${t.trend === "up" ? "text-green-400" : t.trend === "down" ? "text-red-400" : "text-gray-400"}`}>
                {t.trendPct > 0 ? "+" : ""}{t.trendPct}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 後方互換
export function ChannelClient({ channelTrends, monthlyRaw }: { channelTrends: ChannelTrend[]; monthlyRaw: ChannelMonthlyRaw[] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ChannelChartItem data={monthlyRaw} attrFilter="kisotsu" metricFilter="application" title="既卒 申し込み" />
        <ChannelChartItem data={monthlyRaw} attrFilter="kisotsu" metricFilter="closed" title="既卒 成約" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ShinsotsuChannelChartItem data={monthlyRaw} metricFilter="application" title="新卒 申し込み" />
        <ShinsotsuChannelChartItem data={monthlyRaw} metricFilter="closed" title="新卒 成約" />
      </div>
      <ChannelTrendItem channelTrends={channelTrends} />
    </div>
  );
}
