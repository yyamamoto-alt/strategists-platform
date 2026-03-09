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
  ReferenceLine,
} from "recharts";
import type { RevenueMetrics, ThreeTierRevenue } from "@/types/database";

interface PLData {
  period: string;
  cost_of_sales: number;
  sga: number;
}

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

// コスト表示モード
type CostOverlay = "none" | "cost" | "profit";

export function RevenueChart({ data, threeTierData }: RevenueChartProps) {
  if (threeTierData && threeTierData.length > 0) {
    return <UnifiedChart data={threeTierData} />;
  }
  return <FallbackChart data={data} />;
}

/** 統合チャート */
function UnifiedChart({ data }: { data: ThreeTierRevenue[] }) {
  const [colors, setColors] = useState<Record<ColorKey, string>>(DEFAULT_COLORS);
  const [showPicker, setShowPicker] = useState(false);
  const [costOverlay, setCostOverlay] = useState<CostOverlay>("none");
  const [plData, setPlData] = useState<PLData[] | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plError, setPlError] = useState<string | null>(null);

  useEffect(() => { setColors(loadColors()); }, []);

  const handleColorChange = useCallback((key: ColorKey, color: string) => {
    setColors((prev) => {
      const next = { ...prev, [key]: color };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // freee P&Lデータ取得（コストオーバーレイ選択時にlazy load）
  useEffect(() => {
    if (costOverlay === "none" || plData !== null) return;
    setPlLoading(true);
    setPlError(null);
    const currentYear = new Date().getFullYear();
    fetch(`/api/freee/pl?startYear=${currentYear - 1}&endYear=${currentYear}`)
      .then((r) => {
        if (!r.ok) throw new Error("freee未連携またはデータ取得失敗");
        return r.json();
      })
      .then((d) => {
        if (Array.isArray(d)) setPlData(d);
        else throw new Error(d.error || "不明なエラー");
      })
      .catch((e) => setPlError(e.message))
      .finally(() => setPlLoading(false));
  }, [costOverlay, plData]);

  // チャートデータにコスト・利益をマージ
  const chartData = useMemo(() => {
    const plMap: Record<string, PLData> = {};
    if (plData) {
      for (const p of plData) plMap[p.period] = p;
    }

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

      const pl = plMap[d.period];
      const costOfSales = pl?.cost_of_sales || 0;
      const sga = pl?.sga || 0;
      const totalCost = costOfSales + sga;
      const revenue = d.confirmed_total || barTotal;
      const profit = revenue - totalCost;

      return {
        ...d,
        ltv_gap: gap,
        cost_of_sales: costOfSales,
        sga,
        total_cost: totalCost,
        profit,
      };
    });
  }, [data, plData]);

  const showCost = costOverlay !== "none" && plData !== null;

  return (
    <div className="relative">
      {/* ツールバー */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-2">
        {/* コストオーバーレイ切替 */}
        <div className="flex items-center bg-surface-elevated border border-white/10 rounded-lg overflow-hidden">
          <button
            onClick={() => setCostOverlay("none")}
            className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
              costOverlay === "none" ? "bg-brand text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            売上のみ
          </button>
          <button
            onClick={() => setCostOverlay("cost")}
            className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
              costOverlay === "cost" ? "bg-brand text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            コスト重畳
          </button>
          <button
            onClick={() => setCostOverlay("profit")}
            className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
              costOverlay === "profit" ? "bg-brand text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            利益表示
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

      {/* ローディング・エラー表示 */}
      {costOverlay !== "none" && plLoading && (
        <div className="absolute top-10 right-0 z-10 px-3 py-1.5 bg-surface-elevated border border-white/10 rounded-lg text-xs text-gray-400">
          freeeデータ読み込み中...
        </div>
      )}
      {costOverlay !== "none" && plError && (
        <div className="absolute top-10 right-0 z-10 px-3 py-1.5 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300">
          {plError}
        </div>
      )}

      <ResponsiveContainer width="100%" height={600}>
        <ComposedChart data={chartData} margin={{ top: 30, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <DiagonalStripePattern id="stripe-ltv" color={colors.ltv} />
            <pattern id="stripe-cost" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-45)">
              <rect width="6" height="6" fill="#ef4444" fillOpacity="0.08" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="2" strokeOpacity="0.3" />
            </pattern>
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
            tickFormatter={formatPeriodTick}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={formatYen}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            stroke="rgba(255,255,255,0.1)"
            domain={[0, 10000000]}
            ticks={[0, 1000000, 2000000, 3000000, 4000000, 5000000, 6000000, 7000000, 8000000, 9000000, 10000000]}
          />
          {showCost && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={formatYen}
              tick={{ fontSize: 10, fill: "#ef4444" }}
              stroke="rgba(239,68,68,0.2)"
            />
          )}
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
          <Bar yAxisId="left" dataKey="projected_agent" name="人材見込" fill={colors.projected} fillOpacity={0.55} stackId="revenue" />
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

          {/* コスト重畳モード: 原価+販管費をライン表示 */}
          {showCost && costOverlay === "cost" && (
            <>
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cost_of_sales"
                name="原価"
                stroke="#f87171"
                strokeWidth={2}
                dot={{ r: 3, fill: "#f87171" }}
                strokeDasharray="4 2"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="total_cost"
                name="総コスト（原価+販管費）"
                stroke="#ef4444"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#ef4444", stroke: "#fff", strokeWidth: 1 }}
              />
            </>
          )}

          {/* 利益表示モード: 利益ライン */}
          {showCost && costOverlay === "profit" && (
            <>
              <ReferenceLine yAxisId="left" y={0} stroke="rgba(255,255,255,0.2)" />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="total_cost"
                name="総コスト"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="profit"
                name="営業利益"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#22c55e", stroke: "#fff", strokeWidth: 1.5 }}
                activeDot={{ r: 6 }}
              />
            </>
          )}
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
