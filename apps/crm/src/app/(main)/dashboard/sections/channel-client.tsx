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

interface ChannelClientProps {
  channelTrends: ChannelTrend[];
  monthlyRaw: ChannelMonthlyRaw[];
}

type AttrFilter = "kisotsu" | "shinsotsu";
type MetricFilter = "application" | "closed";

export function ChannelClient({ channelTrends, monthlyRaw }: ChannelClientProps) {
  const [attrFilter, setAttrFilter] = useState<AttrFilter>("kisotsu");
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("application");

  const { chartData, channelNames, total } = useMemo(() => {
    // 属性フィルタ
    const filtered = attrFilter === "kisotsu"
      ? monthlyRaw.filter(d => !d.isShinsotsu)
      : monthlyRaw.filter(d => d.isShinsotsu);

    // 指標フィルタ
    const records = metricFilter === "closed"
      ? filtered.filter(d => d.isClosed)
      : filtered;

    // チャネル別合計でメジャーチャネル決定
    const channelTotals = new Map<string, number>();
    for (const d of records) {
      channelTotals.set(d.channel, (channelTotals.get(d.channel) || 0) + 1);
    }

    const majorChannels = new Set<string>();
    for (const [ch, count] of channelTotals) {
      if (count > 3) majorChannels.add(ch);
    }

    // 24ヶ月分
    const now = new Date();
    const months: string[] = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    // 月 × チャネルで集計
    const monthMap = new Map<string, Record<string, number>>();
    for (const m of months) monthMap.set(m, {});

    for (const d of records) {
      const ch = majorChannels.has(d.channel) ? d.channel : "その他";
      const bucket = monthMap.get(d.month);
      if (bucket) bucket[ch] = (bucket[ch] || 0) + 1;
    }

    // チャネル名ソート
    const names = Array.from(majorChannels).sort((a, b) =>
      (channelTotals.get(b) || 0) - (channelTotals.get(a) || 0)
    );
    if (records.some(d => !majorChannels.has(d.channel))) names.push("その他");

    const chart = months.map(m => {
      const row: Record<string, string | number> = { month: m };
      const bucket = monthMap.get(m) || {};
      for (const ch of names) {
        row[ch] = bucket[ch] || 0;
      }
      return row;
    });

    return { chartData: chart, channelNames: names, total: records.length };
  }, [monthlyRaw, attrFilter, metricFilter]);

  const attrLabel = attrFilter === "kisotsu" ? "既卒" : "新卒";
  const metricLabel = metricFilter === "application" ? "申し込み" : "成約";

  return (
    <div className="space-y-4">
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">チャネル別状況</h2>
            <p className="text-[10px] text-gray-500">
              過去24ヶ月 / 3件以下は「その他」 — {attrLabel} × {metricLabel}: <span className="text-white font-bold">{total}件</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 属性セレクター */}
            <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
              {([["kisotsu", "既卒"], ["shinsotsu", "新卒"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setAttrFilter(v)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${attrFilter === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
            {/* 指標セレクター */}
            <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
              {([["application", "申し込み"], ["closed", "成約"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setMetricFilter(v)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${metricFilter === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={(v: string) => v.slice(5)} interval={1} />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "#e5e7eb", fontWeight: 600 }}
              formatter={(value, name) => {
                const v = Number(value);
                if (v === 0) return [null, null];
                return [`${v}件`, name];
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              itemSorter={(item: any) => -(item.value || 0)}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {channelNames.map((name, i) => (
              <Bar
                key={name}
                dataKey={name}
                stackId="main"
                fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
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
