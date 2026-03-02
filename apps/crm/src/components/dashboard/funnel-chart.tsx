"use client";

import { useState } from "react";
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

type Segment = "all" | "kisotsu" | "shinsotsu";

interface FunnelChartProps {
  data: FunnelMetrics[];
  kisotsuData?: FunnelMetrics[];
  shinsotsuData?: FunnelMetrics[];
}

const SEGMENT_LABELS: Record<Segment, string> = {
  all: "全体",
  kisotsu: "既卒",
  shinsotsu: "新卒",
};

export function FunnelChart({ data, kisotsuData, shinsotsuData }: FunnelChartProps) {
  const [segment, setSegment] = useState<Segment>("all");
  const hasSegments = !!kisotsuData && !!shinsotsuData;

  const activeData = segment === "kisotsu" ? (kisotsuData || data)
    : segment === "shinsotsu" ? (shinsotsuData || data)
    : data;

  const chartData = activeData.map((d) => ({
    ...d,
    closing_rate_pct: Math.round(d.closing_rate * 100),
    scheduling_rate_pct: Math.round(d.scheduling_rate * 100),
    conduct_rate_pct: Math.round(d.conduct_rate * 100),
  }));

  return (
    <div>
      {hasSegments && (
        <div className="flex gap-1 mb-3">
          {(Object.keys(SEGMENT_LABELS) as Segment[]).map((seg) => (
            <button
              key={seg}
              onClick={() => setSegment(seg)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                segment === seg
                  ? "bg-brand text-white"
                  : "bg-white/10 text-gray-400 hover:bg-white/20"
              }`}
            >
              {SEGMENT_LABELS[seg]}
            </button>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={hasSegments ? 270 : 300}>
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
            name="成約率(実施→成約%)"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
