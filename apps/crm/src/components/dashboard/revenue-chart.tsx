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

/** 統合チャート: 確定売上（棒）+ 見込みLTVポテンシャル（ドットのみ） */
function UnifiedChart({ data }: { data: ThreeTierRevenue[] }) {
  return (
    <ResponsiveContainer width="100%" height={600}>
      <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
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
          fill="#dc2626"
          stackId="revenue"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="confirmed_subsidy"
          name="補助金"
          fill="#f87171"
          stackId="revenue"
        />
        <Bar
          dataKey="confirmed_school_shinsotsu"
          name="新卒スクール"
          fill="#1e3a5f"
          stackId="revenue"
        />
        <Bar
          dataKey="confirmed_agent"
          name="人材確定"
          fill="#c2410c"
          stackId="revenue"
        />

        {/* その他売上 */}
        <Bar
          dataKey="content_revenue"
          name="note売上"
          fill="#41c9b4"
          stackId="revenue"
        />
        <Bar
          dataKey="myvision_revenue"
          name="MyVision受託"
          fill="#22d3ee"
          stackId="revenue"
        />
        <Bar
          dataKey="other_misc_revenue"
          name="その他"
          fill="#9c9ead"
          stackId="revenue"
        />

        {/* 人材見込売上（半透明オレンジ） */}
        <Bar
          dataKey="projected_agent"
          name="人材見込"
          fill="#ff6b00"
          fillOpacity={0.55}
          stackId="revenue"
          radius={[4, 4, 0, 0]}
        />

        {/* 見込みLTV: ドットのみ（MAXポテンシャル表示） */}
        <Line
          type="monotone"
          dataKey="expected_ltv_total"
          name="見込みLTV（MAXポテンシャル）"
          stroke="transparent"
          strokeWidth={0}
          dot={{ r: 5, fill: "#f28e2b", stroke: "#fff", strokeWidth: 1.5 }}
          activeDot={{ r: 7, fill: "#f28e2b", stroke: "#fff", strokeWidth: 2 }}
          connectNulls={false}
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
