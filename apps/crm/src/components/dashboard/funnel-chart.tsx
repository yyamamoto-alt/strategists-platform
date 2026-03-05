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
  const chartData = data.map((d) => ({
    ...d,
    closing_rate_pct: Math.round(d.closing_rate * 100),
    scheduling_rate_pct: Math.round(d.scheduling_rate * 100),
    conduct_rate_pct: Math.round(d.conduct_rate * 100),
  }));

  return (
    <div>
      <p className="text-sm font-medium text-gray-300 mb-2">{label}</p>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#9ca3af" }} stroke="rgba(255,255,255,0.1)" />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            stroke="rgba(255,255,255,0.1)"
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
          <Bar
            yAxisId="left"
            dataKey="closed"
            name="成約数"
            fill="#22c55e"
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="applications"
            name="申込数"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="closing_rate_pct"
            name="成約率(%)"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 2 }}
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
