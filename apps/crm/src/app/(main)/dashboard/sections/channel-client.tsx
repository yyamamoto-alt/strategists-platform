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

/**
 * 属性別チャネル状況グラフ
 * 1つのグラフ内で申し込み数と成約数を両方表示
 */
function ChannelByAttrChart({
  data,
  title,
  attrFilter,
}: {
  data: ChannelMonthlyRaw[];
  title: string;
  attrFilter: "kisotsu" | "shinsotsu";
}) {
  const { chartData, channelNames, totalApp, totalClosed } = useMemo(() => {
    // 属性フィルタ
    const filtered = attrFilter === "kisotsu"
      ? data.filter(d => !d.isShinsotsu)
      : data.filter(d => d.isShinsotsu);

    // チャネル別の申し込み/成約を分ける
    const appRecords = filtered;
    const closedRecords = filtered.filter(d => d.isClosed);

    // チャネル別合計（申し込みベース）でメジャーチャネル決定
    const channelTotals = new Map<string, number>();
    for (const d of appRecords) {
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

    // 月 × チャネル で申し込みと成約を集計
    const monthAppMap = new Map<string, Record<string, number>>();
    const monthClosedMap = new Map<string, Record<string, number>>();
    for (const m of months) {
      monthAppMap.set(m, {});
      monthClosedMap.set(m, {});
    }

    for (const d of appRecords) {
      const ch = majorChannels.has(d.channel) ? d.channel : "その他";
      const bucket = monthAppMap.get(d.month);
      if (bucket) bucket[ch] = (bucket[ch] || 0) + 1;
    }

    for (const d of closedRecords) {
      const ch = majorChannels.has(d.channel) ? d.channel : "その他";
      const bucket = monthClosedMap.get(d.month);
      if (bucket) bucket[ch] = (bucket[ch] || 0) + 1;
    }

    // チャネル名ソート
    const names = Array.from(majorChannels).sort((a, b) =>
      (channelTotals.get(b) || 0) - (channelTotals.get(a) || 0)
    );
    if (appRecords.some(d => !majorChannels.has(d.channel))) names.push("その他");

    // チャートデータ: 申し込みは正の値、成約は「ch_成約」キーで区別
    const chart = months.map(m => {
      const row: Record<string, string | number> = { month: m };
      const appBucket = monthAppMap.get(m) || {};
      const closedBucket = monthClosedMap.get(m) || {};
      for (const ch of names) {
        row[`${ch}_申込`] = appBucket[ch] || 0;
        row[`${ch}_成約`] = closedBucket[ch] || 0;
      }
      return row;
    });

    return {
      chartData: chart,
      channelNames: names,
      totalApp: appRecords.length,
      totalClosed: closedRecords.length,
    };
  }, [data, attrFilter]);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-[10px] text-gray-500">過去24ヶ月 / 3件以下は「その他」</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-400">申込 <span className="text-white font-bold">{totalApp}</span></span>
          <span className="text-[11px] text-gray-400">成約 <span className="text-white font-bold">{totalClosed}</span></span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={(v: string) => v.slice(5)} interval={1} />
          <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: "#e5e7eb", fontWeight: 600 }}
            formatter={(value, name) => {
              const v = Number(value);
              if (v === 0) return [null, null]; // 0は非表示
              return [`${name}: ${v}件`];
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            itemSorter={(item: any) => -(item.value || 0)}
          />
          <Legend
            wrapperStyle={{ fontSize: 10 }}
            // 申込と成約で同じチャネル色、成約はパターンで区別
            formatter={(value: string) => {
              const parts = value.split("_");
              return `${parts[0]}(${parts[1]})`;
            }}
          />
          {/* 申し込み: 実線バー */}
          {channelNames.map((name, i) => (
            <Bar
              key={`${name}_申込`}
              dataKey={`${name}_申込`}
              stackId="application"
              fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]}
              radius={[0, 0, 0, 0]}
            />
          ))}
          {/* 成約: 同じ色で半透明ストライプ感（opacity下げ） */}
          {channelNames.map((name, i) => (
            <Bar
              key={`${name}_成約`}
              dataKey={`${name}_成約`}
              stackId="closed"
              fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]}
              fillOpacity={0.4}
              stroke={CHANNEL_COLORS[i % CHANNEL_COLORS.length]}
              strokeWidth={1}
              radius={[0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-1 text-[10px] text-gray-500">
        <span>■ 濃い色 = 申し込み</span>
        <span>□ 薄い色 = 成約</span>
      </div>
    </div>
  );
}

export function ChannelClient({ channelTrends, monthlyRaw }: ChannelClientProps) {
  return (
    <div className="space-y-4">
      {/* 属性別チャネル状況: 既卒 & 新卒 横並び */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChannelByAttrChart data={monthlyRaw} title="チャネル別状況（既卒）" attrFilter="kisotsu" />
        <ChannelByAttrChart data={monthlyRaw} title="チャネル別状況（新卒）" attrFilter="shinsotsu" />
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
