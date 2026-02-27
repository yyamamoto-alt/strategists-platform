"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { RevenueMetrics } from "@/types/database";

interface RevenueChartProps {
  data: RevenueMetrics[];
}

const formatYen = (value: number) => {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}千万`;
  if (value >= 10000) return `${(value / 10000).toFixed(0)}万`;
  return value.toString();
};

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="rgba(255,255,255,0.1)" />
        <YAxis tickFormatter={formatYen} tick={{ fontSize: 11, fill: "#9ca3af" }} stroke="rgba(255,255,255,0.1)" />
        <Tooltip
          formatter={(value) =>
            `¥${Number(value).toLocaleString()}`
          }
          contentStyle={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
          labelStyle={{ color: "#9ca3af" }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
        <Bar
          dataKey="school_revenue"
          name="スクール"
          fill="#3b82f6"
          stackId="a"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="agent_revenue"
          name="人材紹介"
          fill="#22c55e"
          stackId="a"
        />
        <Bar
          dataKey="content_revenue"
          name="コンテンツ"
          fill="#f59e0b"
          stackId="a"
        />
        <Bar
          dataKey="other_revenue"
          name="その他"
          fill="#8b5cf6"
          stackId="a"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
