"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { FunnelMetrics } from "@/types/database";

interface FunnelChartProps {
  data: FunnelMetrics[];
  kisotsuData?: FunnelMetrics[];
  shinsotsuData?: FunnelMetrics[];
}

function SingleFunnelChart({
  data,
  label,
  height = 250,
}: {
  data: FunnelMetrics[];
  label: string;
  height?: number;
}) {
  const chartData = data.map((d, i) => {
    const isLatest = i === data.length - 1;
    return {
      ...d,
      closing_rate_confirmed: isLatest ? undefined : Math.round(d.closing_rate * 100),
      closing_rate_latest: isLatest ? Math.round(d.closing_rate * 100) : undefined,
      closing_rate_pct: Math.round(d.closing_rate * 100),
      conduct_rate_confirmed: isLatest ? undefined : Math.round(d.conduct_rate * 100),
      conduct_rate_latest: isLatest ? Math.round(d.conduct_rate * 100) : undefined,
    };
  });

  return (
    <div>
      <p className="text-sm font-medium text-gray-300 mb-2">{label}</p>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 8, fill: "#9ca3af" }}
            stroke="rgba(255,255,255,0.1)"
            angle={-45}
            textAnchor="end"
            height={45}
            interval={0}
            tickFormatter={(v: string) => {
              const [y, m] = v.split("/");
              return m === "01" ? `${y}/${m}` : m;
            }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            stroke="rgba(255,255,255,0.1)"
            unit="人"
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickFormatter={(v) => `${v}%`}
            stroke="rgba(255,255,255,0.1)"
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
            labelStyle={{ color: "#9ca3af" }}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 10, color: "#9ca3af" }} />
          {/* 申込数: 棒グラフ（成約数の後ろに重ねる） */}
          <Bar
            yAxisId="left"
            dataKey="applications"
            name="申込数"
            fill="#3b82f6"
            fillOpacity={0.35}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            yAxisId="left"
            dataKey="closed"
            name="成約数"
            fill="#22c55e"
            radius={[4, 4, 0, 0]}
          />
          {/* 成約率: 確定月（線あり） */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="closing_rate_confirmed"
            name="成約率(%)"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 2 }}
            connectNulls={false}
          />
          {/* 成約率: 最新月（点のみ、線なし） */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="closing_rate_latest"
            name="成約率(暫定)"
            stroke="#f59e0b"
            strokeWidth={0}
            dot={{ r: 4, fill: "#f59e0b", strokeWidth: 2, stroke: "#fff" }}
            legendType="none"
            connectNulls={false}
          />
          {/* 実施率: 確定月（線あり） */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="conduct_rate_confirmed"
            name="実施率(%)"
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 2 }}
            connectNulls={false}
          />
          {/* 実施率: 最新月（点のみ） */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="conduct_rate_latest"
            name="実施率(暫定)"
            stroke="#8b5cf6"
            strokeWidth={0}
            dot={{ r: 4, fill: "#8b5cf6", strokeWidth: 2, stroke: "#fff" }}
            legendType="none"
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FunnelChart({ data, kisotsuData, shinsotsuData }: FunnelChartProps) {
  const hasSegments = !!kisotsuData && !!shinsotsuData;

  if (hasSegments) {
    return (
      <div className="space-y-4">
        <SingleFunnelChart data={kisotsuData} label="既卒" height={230} />
        <SingleFunnelChart data={shinsotsuData} label="新卒" height={230} />
      </div>
    );
  }

  return <SingleFunnelChart data={data} label="全体" height={300} />;
}
