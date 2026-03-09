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
  if (value === 0) return "0";
  if (value >= 10000) return `${(value / 10000).toFixed(0)}万`;
  return value.toString();
};

const formatPeriodTick = (v: string) => {
  const [y, m] = v.split("/");
  return m === "01" ? `${y}/${m}` : m;
};

export function RevenueChart({ data, threeTierData }: RevenueChartProps) {
  if (threeTierData && threeTierData.length > 0) {
    return <UnifiedChart data={threeTierData} />;
  }
  return <FallbackChart data={data} />;
}

/** 統合チャート: 確定売上（棒）+ 見込みLTVポテンシャル（折れ線MAXライン） */
function UnifiedChart({ data }: { data: ThreeTierRevenue[] }) {
  return (
    <ResponsiveContainer width="100%" height={600}>
      <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 8, fill: "#9ca3af" }}
          stroke="rgba(255,255,255,0.1)"
          angle={-45}
          textAnchor="end"
          height={45}
          interval={0}
          tickFormatter={formatPeriodTick}
        />
        <YAxis
          tickFormatter={formatYen}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          stroke="rgba(255,255,255,0.1)"
          domain={[0, 10000000]}
          ticks={[0, 1000000, 2000000, 3000000, 4000000, 5000000, 6000000, 7000000, 8000000, 9000000, 10000000]}
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
        />

        {/* その他売上 */}
        <Bar
          dataKey="content_revenue"
          name="note売上"
          fill="#ec4899"
          stackId="revenue"
        />
        <Bar
          dataKey="myvision_revenue"
          name="MyVision受託"
          fill="#06b6d4"
          stackId="revenue"
        />
        <Bar
          dataKey="other_misc_revenue"
          name="その他"
          fill="#6b7280"
          stackId="revenue"
        />

        {/* 人材見込売上（半透明オレンジ） */}
        <Bar
          dataKey="projected_agent"
          name="人材見込"
          fill="#f97316"
          fillOpacity={0.5}
          stackId="revenue"
          radius={[4, 4, 0, 0]}
        />

        {/* MAXライン: 見込みLTV合計（当月は月末推定に拡大） */}
        <Line
          type="monotone"
          dataKey="expected_ltv_total"
          name="見込みLTV（MAXポテンシャル）"
          stroke="#f97316"
          strokeWidth={2.5}
          strokeDasharray="6 3"
          dot={{ r: 3, fill: "#f97316", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#f97316" }}
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
    <ResponsiveContainer width="100%" height={600}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 8, fill: "#9ca3af" }}
          stroke="rgba(255,255,255,0.1)"
          angle={-45}
          textAnchor="end"
          height={45}
          interval={0}
          tickFormatter={formatPeriodTick}
        />
        <YAxis
          tickFormatter={formatYen}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          stroke="rgba(255,255,255,0.1)"
          domain={[0, 10000000]}
          ticks={[0, 1000000, 2000000, 3000000, 4000000, 5000000, 6000000, 7000000, 8000000, 9000000, 10000000]}
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
