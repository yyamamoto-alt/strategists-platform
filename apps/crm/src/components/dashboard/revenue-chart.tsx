"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
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

type ViewMode = "segment" | "three-tier";

export function RevenueChart({ data, threeTierData }: RevenueChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(
    threeTierData && threeTierData.length > 0 ? "three-tier" : "segment"
  );

  return (
    <div>
      {threeTierData && threeTierData.length > 0 && (
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setViewMode("three-tier")}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              viewMode === "three-tier"
                ? "bg-brand text-white"
                : "bg-white/10 text-gray-400 hover:bg-white/20"
            }`}
          >
            3段階売上
          </button>
          <button
            onClick={() => setViewMode("segment")}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              viewMode === "segment"
                ? "bg-brand text-white"
                : "bg-white/10 text-gray-400 hover:bg-white/20"
            }`}
          >
            セグメント別
          </button>
        </div>
      )}

      {viewMode === "three-tier" && threeTierData ? (
        <ThreeTierChart data={threeTierData} />
      ) : (
        <SegmentChart data={data} />
      )}
    </div>
  );
}

function ThreeTierChart({ data }: { data: ThreeTierRevenue[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
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
        {/* Tier 1: 確定売上（積み上げ棒） */}
        <Bar
          dataKey="confirmed_school"
          name="スクール確定"
          fill="#3b82f6"
          stackId="confirmed"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="confirmed_agent"
          name="人材確定"
          fill="#22c55e"
          stackId="confirmed"
        />
        <Bar
          dataKey="confirmed_subsidy"
          name="補助金"
          fill="#8b5cf6"
          stackId="confirmed"
          radius={[4, 4, 0, 0]}
        />
        {/* Tier 2: 見込み含む（線） */}
        <Line
          type="monotone"
          dataKey="projected_total"
          name="見込み含む売上"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 3, fill: "#f59e0b" }}
        />
        {/* Tier 3: 予測（点線） */}
        <Line
          type="monotone"
          dataKey="forecast_total"
          name="予測売上"
          stroke="#ef4444"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={{ r: 3, fill: "#ef4444" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function SegmentChart({ data }: { data: RevenueMetrics[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
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
        <Bar
          dataKey="school_revenue"
          name="スクール"
          fill="#3b82f6"
          stackId="a"
          radius={[0, 0, 0, 0]}
        />
        <Bar dataKey="agent_revenue" name="人材紹介" fill="#22c55e" stackId="a" />
        <Bar dataKey="content_revenue" name="コンテンツ" fill="#f59e0b" stackId="a" />
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
