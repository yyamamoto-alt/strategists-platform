"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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

const formatPeriodLabel = (v: string, quarterly: boolean) => {
  if (quarterly) {
    const match = v.match(/^(\d{4})\/Q(\d)$/);
    if (match) {
      const year = match[1];
      const q = Number(match[2]);
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = q * 3;
      return `${year}/${startMonth}-${endMonth}`;
    }
    return v;
  }
  const [y, m] = v.split("/");
  return m === "01" ? `${y}/${m}` : m;
};

const formatPeriodTick = (v: string) => formatPeriodLabel(v, false);

// --- カラー設定 ---
const SERIES_KEYS = [
  { key: "kisotsu", label: "既卒スクール" },
  { key: "subsidy", label: "補助金" },
  { key: "shinsotsu", label: "新卒スクール" },
  { key: "agent", label: "人材確定" },
  { key: "note", label: "note売上" },
  { key: "myvision", label: "MyVision受託" },
  { key: "other", label: "その他" },
  { key: "projected", label: "人材見込" },
  { key: "ltv", label: "着地見込（forecast）" },
] as const;

type ColorKey = (typeof SERIES_KEYS)[number]["key"];

const DEFAULT_COLORS: Record<ColorKey, string> = {
  kisotsu: "#dc2626",
  subsidy: "#f87171",
  shinsotsu: "#1e3a5f",
  agent: "#c2410c",
  note: "#41c9b4",
  myvision: "#22d3ee",
  other: "#9c9ead",
  projected: "#ff6b00",
  ltv: "#f28e2b",
};

const STORAGE_KEY = "crm-revenue-chart-colors";

function loadColors(): Record<ColorKey, string> {
  if (typeof window === "undefined") return { ...DEFAULT_COLORS };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_COLORS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULT_COLORS };
}

function ColorPicker({ colors, onChange, onClose }: {
  colors: Record<ColorKey, string>;
  onChange: (key: ColorKey, color: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-8 right-0 z-50 bg-[#1A1A1A] border border-white/15 rounded-lg p-3 shadow-xl min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-medium">配色設定</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-sm">✕</button>
      </div>
      <div className="space-y-1.5">
        {SERIES_KEYS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <input
              type="color"
              value={colors[key]}
              onChange={(e) => onChange(key, e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded"
            />
            <span className="text-[11px] text-gray-300">{label}</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          localStorage.removeItem(STORAGE_KEY);
          for (const { key } of SERIES_KEYS) onChange(key, DEFAULT_COLORS[key]);
        }}
        className="mt-2 text-[10px] text-gray-500 hover:text-gray-300"
      >
        デフォルトに戻す
      </button>
    </div>
  );
}

/** SVG斜線パターン定義 */
function DiagonalStripePattern({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <rect width="8" height="8" fill={color} fillOpacity="0.18" />
      <line x1="0" y1="0" x2="0" y2="8" stroke={color} strokeWidth="3" strokeOpacity="0.5" />
    </pattern>
  );
}

/** 人材見込用: 薄い透明パターン（ドット） */
function ProjectedDotPattern({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6">
      <rect width="6" height="6" fill={color} fillOpacity="0.12" />
      <circle cx="3" cy="3" r="0.8" fill={color} fillOpacity="0.45" />
    </pattern>
  );
}

export function RevenueChart({ data, threeTierData }: RevenueChartProps) {
  if (threeTierData && threeTierData.length > 0) {
    return <UnifiedChart data={threeTierData} />;
  }
  return <FallbackChart data={data} />;
}

/** 統合チャート（コスト機能除去済み） */
function UnifiedChart({ data }: { data: ThreeTierRevenue[] }) {
  const [colors, setColors] = useState<Record<ColorKey, string>>(DEFAULT_COLORS);
  const [showPicker, setShowPicker] = useState(false);
  const [periodMode, setPeriodMode] = useState<"monthly" | "quarterly">("monthly");

  useEffect(() => { setColors(loadColors()); }, []);

  const handleColorChange = useCallback((key: ColorKey, color: string) => {
    setColors((prev) => {
      const next = { ...prev, [key]: color };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const monthlyData = useMemo(() => {
    return data.map((d) => {
      const barTotal =
        (d.confirmed_school_kisotsu || 0) +
        (d.confirmed_subsidy || 0) +
        (d.confirmed_school_shinsotsu || 0) +
        (d.confirmed_agent || 0) +
        (d.content_revenue || 0) +
        (d.myvision_revenue || 0) +
        (d.other_misc_revenue || 0) +
        (d.projected_agent || 0);
      const gap = Math.max(0, (d.expected_ltv_total || 0) - barTotal);

      return {
        ...d,
        ltv_gap: gap,
      };
    });
  }, [data]);

  // 四半期集計
  const quarterlyData = useMemo(() => {
    const qMap: Record<string, typeof monthlyData[number]> = {};

    for (const d of monthlyData) {
      const [y, m] = d.period.split("/").map(Number);
      const q = Math.ceil(m / 3);
      const qKey = `${y}/Q${q}`;

      if (!qMap[qKey]) {
        qMap[qKey] = {
          ...d,
          period: qKey,
          confirmed_school_kisotsu: 0,
          confirmed_subsidy: 0,
          confirmed_school_shinsotsu: 0,
          confirmed_agent: 0,
          content_revenue: 0,
          myvision_revenue: 0,
          other_misc_revenue: 0,
          projected_agent: 0,
          ltv_gap: 0,
          confirmed_school: 0,
          confirmed_total: 0,
          projected_total: 0,
          forecast_total: 0,
          expected_ltv_total: 0,
        };
      }
      const target = qMap[qKey];
      target.confirmed_school_kisotsu += d.confirmed_school_kisotsu || 0;
      target.confirmed_subsidy += d.confirmed_subsidy || 0;
      target.confirmed_school_shinsotsu += d.confirmed_school_shinsotsu || 0;
      target.confirmed_agent += d.confirmed_agent || 0;
      target.content_revenue = (target.content_revenue || 0) + (d.content_revenue || 0);
      target.myvision_revenue = (target.myvision_revenue || 0) + (d.myvision_revenue || 0);
      target.other_misc_revenue = (target.other_misc_revenue || 0) + (d.other_misc_revenue || 0);
      target.projected_agent += d.projected_agent || 0;
      target.ltv_gap += d.ltv_gap;
      target.confirmed_total += d.confirmed_total || 0;
      target.expected_ltv_total += d.expected_ltv_total || 0;
    }

    return Object.values(qMap).sort((a, b) => a.period.localeCompare(b.period));
  }, [monthlyData]);

  const chartData = periodMode === "quarterly" ? quarterlyData : monthlyData;
  const isQuarterly = periodMode === "quarterly";

  const yMax = useMemo(() => {
    let max = 0;
    for (const d of chartData) {
      const barTotal =
        (d.confirmed_school_kisotsu || 0) +
        (d.confirmed_subsidy || 0) +
        (d.confirmed_school_shinsotsu || 0) +
        (d.confirmed_agent || 0) +
        (d.content_revenue || 0) +
        (d.myvision_revenue || 0) +
        (d.other_misc_revenue || 0) +
        (d.projected_agent || 0) +
        (d.ltv_gap || 0);
      if (barTotal > max) max = barTotal;
    }
    const step = 1000000;
    return Math.ceil(max * 1.1 / step) * step || 10000000;
  }, [chartData]);

  const yTicks = useMemo(() => {
    const step = yMax <= 10000000 ? 1000000 : yMax <= 30000000 ? 2000000 : 5000000;
    const ticks: number[] = [];
    for (let i = 0; i <= yMax; i += step) ticks.push(i);
    return ticks;
  }, [yMax]);

  return (
    <div className="relative">
      {/* ツールバー */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-2">
        <div className="flex items-center bg-surface-elevated border border-white/10 rounded-lg overflow-hidden">
          <button
            onClick={() => setPeriodMode("monthly")}
            className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
              periodMode === "monthly" ? "bg-brand text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            月次
          </button>
          <button
            onClick={() => setPeriodMode("quarterly")}
            className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
              periodMode === "quarterly" ? "bg-brand text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            四半期
          </button>
        </div>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
          title="配色設定"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
      {showPicker && (
        <ColorPicker colors={colors} onChange={handleColorChange} onClose={() => setShowPicker(false)} />
      )}

      <ResponsiveContainer width="100%" height={600}>
        <ComposedChart data={chartData} margin={{ top: 30, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <DiagonalStripePattern id="stripe-ltv" color={colors.ltv} />
            <ProjectedDotPattern id="dot-projected" color={colors.projected} />
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 8, fill: "#9ca3af" }}
            stroke="rgba(255,255,255,0.1)"
            angle={-45}
            textAnchor="end"
            height={45}
            interval={0}
            tickFormatter={(v: string) => formatPeriodLabel(v, isQuarterly)}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={formatYen}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            stroke="rgba(255,255,255,0.1)"
            domain={[0, yMax]}
            ticks={yTicks}
          />
          <Tooltip
            formatter={(value, name) => [`¥${Number(value).toLocaleString()}`, name]}
            contentStyle={{
              backgroundColor: "#1A1A1A",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#fff",
            }}
            labelStyle={{ color: "#9ca3af" }}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />

          {/* 売上棒グラフ */}
          <Bar yAxisId="left" dataKey="confirmed_school_kisotsu" name="既卒スクール" fill={colors.kisotsu} stackId="revenue" radius={[0, 0, 0, 0]} />
          <Bar yAxisId="left" dataKey="confirmed_subsidy" name="補助金" fill={colors.subsidy} stackId="revenue" />
          <Bar yAxisId="left" dataKey="confirmed_school_shinsotsu" name="新卒スクール" fill={colors.shinsotsu} stackId="revenue" />
          <Bar yAxisId="left" dataKey="confirmed_agent" name="人材確定" fill={colors.agent} stackId="revenue" />
          <Bar yAxisId="left" dataKey="content_revenue" name="note売上" fill={colors.note} stackId="revenue" />
          <Bar yAxisId="left" dataKey="myvision_revenue" name="MyVision受託" fill={colors.myvision} stackId="revenue" />
          <Bar yAxisId="left" dataKey="other_misc_revenue" name="その他" fill={colors.other} stackId="revenue" />
          <Bar
            yAxisId="left"
            dataKey="projected_agent"
            name="人材見込"
            fill="url(#dot-projected)"
            stroke={colors.projected}
            strokeWidth={1}
            strokeOpacity={0.5}
            strokeDasharray="3 2"
            stackId="revenue"
          />
          <Bar
            yAxisId="left"
            dataKey="ltv_gap"
            name="着地見込（forecast）"
            fill="url(#stripe-ltv)"
            stroke={colors.ltv}
            strokeWidth={0.5}
            strokeOpacity={0.4}
            stackId="revenue"
            radius={[4, 4, 0, 0]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
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
