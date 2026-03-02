"use client";

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
} from "recharts";
import type { RevenueMetrics, ThreeTierRevenue } from "@/types/database";

interface RevenueChartProps {
  data: RevenueMetrics[];
  threeTierData?: ThreeTierRevenue[];
}

const formatYen = (value: number) => {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}千万`;
  if (value >= 10000) return `${(value / 10000).toFixed(0)}万`;
  return value.toString();
};

export function RevenueChart({ data, threeTierData }: RevenueChartProps) {
  if (threeTierData && threeTierData.length > 0) {
    return <UnifiedChart data={threeTierData} />;
  }
  return <FallbackChart data={data} />;
}

/** 統合チャート: セグメント別積み上げ棒 + 3段階ライン */
function UnifiedChart({ data }: { data: ThreeTierRevenue[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          stroke="rgba(255,255,255,0.1)"
        />
        <YAxis
          tickFormatter={formatYen}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          stroke="rgba(255,255,255,0.1)"
        />
        <Tooltip
          formatter={(value) => `¥${Number(value).toLocaleString()}`}
          contentStyle={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            color: "#fff",
          }}
          labelStyle={{ color: "#9ca3af" }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />

        {/* 積み上げ棒: 確定売上セグメント内訳 */}
        <Bar
          dataKey="confirmed_school_kisotsu"
          name="既卒スクール"
          fill="#3b82f6"
          stackId="revenue"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="confirmed_school_shinsotsu"
          name="新卒スクール"
          fill="#22c55e"
          stackId="revenue"
        />
        <Bar
          dataKey="confirmed_agent"
          name="人材確定"
          fill="#f59e0b"
          stackId="revenue"
        />
        <Bar
          dataKey="confirmed_subsidy"
          name="補助金"
          fill="#a855f7"
          stackId="revenue"
          radius={[4, 4, 0, 0]}
        />

        {/* ライン: Tier 2 見込み含む（確定+人材見込） */}
        <Line
          type="monotone"
          dataKey="projected_total"
          name="確定+人材見込"
          stroke="#94a3b8"
          strokeWidth={2}
          dot={{ r: 3, fill: "#94a3b8" }}
        />

        {/* ライン: Tier 3 予測（パイプライン期待値含む） */}
        <Line
          type="monotone"
          dataKey="forecast_total"
          name="予測売上"
          stroke="#f97316"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={{ r: 3, fill: "#f97316" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** フォールバック: threeTierData がない場合 */
function FallbackChart({ data }: { data: RevenueMetrics[] }) {
  const chartData = data.map((d) => ({
    period: d.period,
    confirmed: d.confirmed_revenue,
    projected: d.projected_revenue,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          stroke="rgba(255,255,255,0.1)"
        />
        <YAxis
          tickFormatter={formatYen}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          stroke="rgba(255,255,255,0.1)"
        />
        <Tooltip
          formatter={(value) => `¥${Number(value).toLocaleString()}`}
          contentStyle={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            color: "#fff",
          }}
          labelStyle={{ color: "#9ca3af" }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
        <Bar dataKey="confirmed" name="確定売上" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Line type="monotone" dataKey="projected" name="見込み売上" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
