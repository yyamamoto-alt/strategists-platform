"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { ChannelTrend, ChannelAttributeBar } from "@/lib/data/dashboard-metrics";

interface ChannelClientProps {
  channelTrends: ChannelTrend[];
  applicationBars: ChannelAttributeBar[];
  closedBars: ChannelAttributeBar[];
}

function ChannelBarChart({ data, title }: { data: ChannelAttributeBar[]; title: string }) {
  if (data.length === 0) {
    return (
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
        <h2 className="text-sm font-semibold text-white mb-2">{title}</h2>
        <p className="text-xs text-gray-500">データなし</p>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.total, 0);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-[10px] text-gray-500">帰属チャネル別（3件以下は「その他」）</p>
        </div>
        <span className="text-lg font-bold text-white">{total}<span className="text-xs text-gray-400 ml-1">件</span></span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(data.length * 40 + 40, 200)}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} allowDecimals={false} />
          <YAxis type="category" dataKey="channel" width={100}
            tick={{ fontSize: 11, fill: "#d1d5db" }} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#e5e7eb", fontWeight: 600 }}
            formatter={(value, name) => [
              `${Number(value)}件`,
              String(name) === "kisotsu" ? "既卒" : "新卒",
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => value === "kisotsu" ? "既卒" : "新卒"}
          />
          <Bar dataKey="kisotsu" stackId="attr" fill="#3b82f6" radius={[0, 0, 0, 0]} />
          <Bar dataKey="shinsotsu" stackId="attr" fill="#f59e0b" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChannelClient({ channelTrends, applicationBars, closedBars }: ChannelClientProps) {
  return (
    <div className="space-y-4">
      {/* 棒グラフ: 申し込み数 & 成約数 横並び */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChannelBarChart data={applicationBars} title="チャネル別 申し込み数" />
        <ChannelBarChart data={closedBars} title="チャネル別 成約数" />
      </div>

      {/* 既存のチャネル推移バッジ */}
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
