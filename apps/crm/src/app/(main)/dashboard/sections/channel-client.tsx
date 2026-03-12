"use client";

import type { ChannelTrend } from "@/lib/data/dashboard-metrics";

interface ChannelClientProps {
  channelTrends: ChannelTrend[];
}

export function ChannelClient({ channelTrends }: ChannelClientProps) {
  return (
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
  );
}
