"use client";

import {
  LineChart,
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
}

export function FunnelChart({ data }: FunnelChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    closing_rate_pct: Math.round(d.closing_rate * 100),
    scheduling_rate_pct: Math.round(d.scheduling_rate * 100),
    conduct_rate_pct: Math.round(d.conduct_rate * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="rgba(255,255,255,0.1)" />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          stroke="rgba(255,255,255,0.1)"
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickFormatter={(v) => `${v}%`}
          stroke="rgba(255,255,255,0.1)"
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
          labelStyle={{ color: "#9ca3af" }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="applications"
          name="申込数"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="closed"
          name="成約数"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="closing_rate_pct"
          name="成約率(%)"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
