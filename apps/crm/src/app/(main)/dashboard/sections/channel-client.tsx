"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { ChannelTrend, ChannelMonthlyRaw } from "@/lib/data/dashboard-metrics";

const CHANNEL_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
  "#14b8a6", "#e11d48", "#a855f7", "#0ea5e9", "#facc15",
];

interface ChannelClientProps {
  channelTrends: ChannelTrend[];
  monthlyRaw: ChannelMonthlyRaw[];
}

function useChannelChart(
  data: ChannelMonthlyRaw[],
  isAttr: (d: ChannelMonthlyRaw) => boolean,
  isClosed: boolean,
) {
  return useMemo(() => {
    const filtered = data.filter(isAttr);
    const records = isClosed ? filtered.filter(d => d.isClosed) : filtered;

    const channelTotals = new Map<string, number>();
    for (const d of records) {
      channelTotals.set(d.channel, (channelTotals.get(d.channel) || 0) + 1);
    }

    const majorChannels = new Set<string>();
    for (const [ch, count] of channelTotals) {
      if (count > 3) majorChannels.add(ch);
    }

    const now = new Date();
    const months: string[] = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const monthMap = new Map<string, Record<string, number>>();
    for (const m of months) monthMap.set(m, {});

    for (const d of records) {
      const ch = majorChannels.has(d.channel) ? d.channel : "その他";
      const bucket = monthMap.get(d.month);
      if (bucket) bucket[ch] = (bucket[ch] || 0) + 1;
    }

    const names = Array.from(majorChannels).sort((a, b) =>
      (channelTotals.get(b) || 0) - (channelTotals.get(a) || 0)
    );
    if (records.some(d => !majorChannels.has(d.channel))) names.push("その他");

    const chartData = months.map(m => {
      const row: Record<string, string | number> = { month: m };
      const bucket = monthMap.get(m) || {};
      for (const ch of names) row[ch] = bucket[ch] || 0;
      return row;
    });

    return { chartData, channelNames: names, total: records.length };
  }, [data, isAttr, isClosed]);
}

function ChannelChart({
  title,
  chartData,
  channelNames,
  total,
}: {
  title: string;
  chartData: Record<string, unknown>[];
  channelNames: string[];
  total: number;
}) {
  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-white">{title}</h3>
        <span className="text-sm font-bold text-white">{total}<span className="text-[10px] text-gray-400 ml-1">件</span></span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
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
              return [`${name}: ${v}件`];
            }}
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

const isKisotsu = (d: ChannelMonthlyRaw) => !d.isShinsotsu;
const isShinsotsu = (d: ChannelMonthlyRaw) => d.isShinsotsu;

export function ChannelClient({ channelTrends, monthlyRaw }: ChannelClientProps) {
  const kisotsuApp = useChannelChart(monthlyRaw, isKisotsu, false);
  const kisotsuClosed = useChannelChart(monthlyRaw, isKisotsu, true);
  const shinsotsuApp = useChannelChart(monthlyRaw, isShinsotsu, false);
  const shinsotsuClosed = useChannelChart(monthlyRaw, isShinsotsu, true);

  return (
    <div className="space-y-4">
      {/* 既卒: 申し込み + 成約 */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-2 px-1">チャネル別状況（既卒）</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChannelChart title="申し込み" {...kisotsuApp} />
          <ChannelChart title="成約" {...kisotsuClosed} />
        </div>
      </div>

      {/* 新卒: 申し込み + 成約 */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-2 px-1">チャネル別状況（新卒）</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChannelChart title="申し込み" {...shinsotsuApp} />
          <ChannelChart title="成約" {...shinsotsuClosed} />
        </div>
      </div>

      {/* チャネル別申込推移バッジ */}
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
        <div className="mb-2">
          <h2 className="text-sm font-semibold text-white">チャネル別申込推移</h2>
          <p className="text-[10px] text-gray-500">直近1ヶ月 vs 前2ヶ月（月平均）</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {channelTrends.map((t) => (
            <div
              key={t.channel}
              className={`rounded border px-2 py-1.5 flex items-center gap-2 ${
                t.trend === "up"
                  ? "border-green-500/30 bg-green-500/5"
                  : t.trend === "down"
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <span className="text-[11px] text-gray-300">{t.channel}</span>
              <span className="text-sm font-bold text-white">{t.recentCount}</span>
              <span className="text-[10px] text-gray-500">/ {t.baselineMonthlyRate}</span>
              {t.trendPct !== 0 && (
                <span className={`text-[11px] font-semibold ${
                  t.trend === "up" ? "text-green-400" : t.trend === "down" ? "text-red-400" : "text-gray-400"
                }`}>
                  {t.trendPct > 0 ? "+" : ""}{t.trendPct}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
