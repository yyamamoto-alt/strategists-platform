"use client";

import { useState, useMemo } from "react";

interface AdsWeeklyReport {
  id: string;
  platform: string;
  week_start: string;
  week_end: string;
  cost: number | null;
  impressions: number | null;
  clicks: number | null;
  cpc: number | null;
  ctr: number | null;
  applications: number | null;
  application_cpa: number | null;
  schedules: number | null;
  schedule_cpa: number | null;
  contracts: number | null;
  revenue: number | null;
  roas: number | null;
  keeps: string[] | null;
  problems: string[] | null;
  tries: string[] | null;
  report_url: string | null;
  customer_details: {
    applications?: { name: string; date?: string }[];
    schedules?: { name: string; stage?: string }[];
    contracts?: { name: string; revenue?: number }[];
  } | null;
}

const fmtCurrency = (v: number | null) =>
  v != null ? `¥${Math.round(v).toLocaleString()}` : "-";
const fmtPct = (v: number | null) =>
  v != null ? `${(v * 100).toFixed(2)}%` : "-";
const fmtNum = (v: number | null) =>
  v != null ? v.toLocaleString() : "-";
const fmtRoas = (v: number | null) =>
  v != null && v > 0 ? `${v.toFixed(1)}x` : "-";
const fmtWeek = (start: string, end: string) => {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.getMonth() + 1}/${s.getDate()}〜${e.getMonth() + 1}/${e.getDate()}`;
};

// ヒートマップ: 値が高いほど色が濃い（カラム内の相対位置）
// direction: "higher-better" = 高い値が緑（申込数、売上、ROAS等）
//            "lower-better"  = 低い値が緑（CPC、CPA等）
//            "neutral"       = 中央が薄く両端が濃い（費用等、単純に変化を見せる）
type HeatDirection = "higher-better" | "lower-better" | "neutral";

function calcHeatBg(value: number | null, min: number, max: number, direction: HeatDirection): string {
  if (value == null || min === max) return "";
  const ratio = (value - min) / (max - min); // 0〜1

  if (direction === "higher-better") {
    // 0=赤っぽい, 1=緑っぽい
    const r = Math.round(80 + (1 - ratio) * 60);
    const g = Math.round(80 + ratio * 80);
    const b = Math.round(80);
    return `rgba(${r - 80}, ${g - 30}, ${b - 60}, ${0.15 + ratio * 0.25})`;
  } else if (direction === "lower-better") {
    // 0=緑っぽい, 1=赤っぽい (reversed)
    const inv = 1 - ratio;
    const r = Math.round(80 + ratio * 60);
    const g = Math.round(80 + inv * 80);
    const b = Math.round(80);
    return `rgba(${r - 80}, ${g - 30}, ${b - 60}, ${0.15 + (1 - inv) * 0.25})`;
  } else {
    // neutral: intensity based on distance from mean
    const intensity = Math.abs(ratio - 0.5) * 2; // 0〜1
    return `rgba(99, 102, 241, ${0.05 + intensity * 0.25})`;
  }
}

function renderKpt(items: string[] | null) {
  if (!items || items.length === 0) return "-";
  return (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        <div key={i} className="text-sm text-gray-300 leading-snug">
          <span className="text-gray-500">・</span>
          {item}
        </div>
      ))}
    </div>
  );
}

function customerTooltip(
  details: AdsWeeklyReport["customer_details"],
  field: "applications" | "schedules" | "contracts"
): string {
  if (!details) return "";
  const list = details[field];
  if (!list || list.length === 0) return "該当なし";
  return list
    .map((c) => {
      if (field === "applications") return `${c.name}（${(c as { date?: string }).date || ""}）`;
      if (field === "contracts") return `${c.name}（¥${((c as { revenue?: number }).revenue || 0).toLocaleString()}）`;
      return `${c.name}（${(c as { stage?: string }).stage || ""}）`;
    })
    .join("\n");
}

function revenueTooltip(details: AdsWeeklyReport["customer_details"]): string {
  if (!details?.contracts || details.contracts.length === 0) return "内訳: スクール確定額 + 補助金 + 人材紹介見込";
  return details.contracts
    .map((c) => `${c.name}: ¥${((c as { revenue?: number }).revenue || 0).toLocaleString()}`)
    .join("\n");
}

type Tab = "google" | "meta";

// ヒートマップ対象のカラム定義
interface HeatCol {
  key: string;
  direction: HeatDirection;
  getValue: (r: AdsWeeklyReport, rollingRoas: Map<string, number | null>) => number | null;
}

const HEAT_COLS: HeatCol[] = [
  { key: "cost", direction: "neutral", getValue: (r) => r.cost },
  { key: "impressions", direction: "higher-better", getValue: (r) => r.impressions },
  { key: "clicks", direction: "higher-better", getValue: (r) => r.clicks },
  { key: "cpc", direction: "lower-better", getValue: (r) => r.cpc },
  { key: "ctr", direction: "higher-better", getValue: (r) => r.ctr },
  { key: "applications", direction: "higher-better", getValue: (r) => r.applications },
  { key: "application_cpa", direction: "lower-better", getValue: (r) => r.application_cpa },
  { key: "schedules", direction: "higher-better", getValue: (r) => r.schedules },
  { key: "contracts", direction: "higher-better", getValue: (r) => r.contracts },
  { key: "revenue", direction: "higher-better", getValue: (r) => r.revenue },
  { key: "roas", direction: "higher-better", getValue: (_, rm) => null }, // handled separately
];

export function AdsReportsClient({ reports }: { reports: AdsWeeklyReport[] }) {
  const [activeTab, setActiveTab] = useState<Tab>("google");

  const filtered = reports.filter((r) =>
    activeTab === "google"
      ? r.platform?.toLowerCase() === "google"
      : r.platform?.toLowerCase() === "meta"
  );

  // 8週ローリングROAS計算
  const rollingRoasMap = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.week_start.localeCompare(b.week_start));
    const map = new Map<string, number | null>();
    for (let i = 0; i < sorted.length; i++) {
      const windowStart = Math.max(0, i - 7);
      let totalCost = 0;
      let totalRevenue = 0;
      for (let j = windowStart; j <= i; j++) {
        totalCost += sorted[j].cost ?? 0;
        totalRevenue += sorted[j].revenue ?? 0;
      }
      map.set(sorted[i].week_start, totalCost > 0 ? totalRevenue / totalCost : null);
    }
    return map;
  }, [filtered]);

  // 各カラムのmin/maxを計算（ヒートマップ用）
  const heatRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const col of HEAT_COLS) {
      const values = filtered
        .map((r) => col.key === "roas" ? (rollingRoasMap.get(r.week_start) ?? null) : col.getValue(r, rollingRoasMap))
        .filter((v): v is number => v != null && v > 0);
      if (values.length > 0) {
        ranges[col.key] = { min: Math.min(...values), max: Math.max(...values) };
      }
    }
    return ranges;
  }, [filtered, rollingRoasMap]);

  function heatStyle(key: string, value: number | null): React.CSSProperties {
    const range = heatRanges[key];
    const col = HEAT_COLS.find((c) => c.key === key);
    if (!range || !col || value == null || value <= 0) return {};
    return { backgroundColor: calcHeatBg(value, range.min, range.max, col.direction) };
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">広告分析レポート</h1>
        <p className="text-sm text-gray-500 mt-1">週次広告パフォーマンスレポート</p>
      </div>

      {/* Tab switching */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("google")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "google"
              ? "bg-brand text-white border border-brand"
              : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-300"
          }`}
        >
          Google
        </button>
        <button
          onClick={() => setActiveTab("meta")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "meta"
              ? "bg-brand text-white border border-brand"
              : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-300"
          }`}
        >
          Meta
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-gray-500">
        <span>ヒートマップ:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "rgba(0, 130, 20, 0.35)" }} />
          良好
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "rgba(140, 50, 20, 0.35)" }} />
          要注意
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "rgba(99, 102, 241, 0.25)" }} />
          変動大（費用）
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          レポートデータがありません
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full">
            <thead className="sticky top-0 z-10 bg-surface-raised">
              <tr>
                {[
                  "期間", "費用", "Imp", "Click", "CPC", "CTR",
                  "申込数", "申込CPA", "日程確定", "成約数", "売上",
                  "ROAS(8週)", "Keep", "Problem", "Try", "レポート",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 whitespace-nowrap align-top"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => {
                const rollingRoas = rollingRoasMap.get(r.week_start) ?? null;
                return (
                  <tr
                    key={r.id ?? idx}
                    className={`border-b border-white/5 hover:bg-white/5 transition-colors align-top`}
                  >
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap">
                      {fmtWeek(r.week_start, r.week_end)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right" style={heatStyle("cost", r.cost)}>
                      {fmtCurrency(r.cost)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right" style={heatStyle("impressions", r.impressions)}>
                      {fmtNum(r.impressions)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right" style={heatStyle("clicks", r.clicks)}>
                      {fmtNum(r.clicks)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right" style={heatStyle("cpc", r.cpc)}>
                      {fmtCurrency(r.cpc)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right" style={heatStyle("ctr", r.ctr)}>
                      {fmtPct(r.ctr)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right cursor-help" style={heatStyle("applications", r.applications)}
                      title={customerTooltip(r.customer_details, "applications")}>
                      {fmtNum(r.applications)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right" style={heatStyle("application_cpa", r.application_cpa)}>
                      {fmtCurrency(r.application_cpa)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right cursor-help" style={heatStyle("schedules", r.schedules)}
                      title={customerTooltip(r.customer_details, "schedules")}>
                      {fmtNum(r.schedules)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right cursor-help" style={heatStyle("contracts", r.contracts)}
                      title={customerTooltip(r.customer_details, "contracts")}>
                      {fmtNum(r.contracts)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right cursor-help" style={heatStyle("revenue", r.revenue)}
                      title={revenueTooltip(r.customer_details)}>
                      {fmtCurrency(r.revenue)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right" style={heatStyle("roas", rollingRoas)}>
                      {fmtRoas(rollingRoas)}
                    </td>
                    <td className="px-3 py-2 whitespace-normal min-w-[300px] max-w-[400px]">
                      {renderKpt(r.keeps)}
                    </td>
                    <td className="px-3 py-2 whitespace-normal min-w-[300px] max-w-[400px]">
                      {renderKpt(r.problems)}
                    </td>
                    <td className="px-3 py-2 whitespace-normal min-w-[300px] max-w-[400px]">
                      {renderKpt(r.tries)}
                    </td>
                    <td className="px-3 py-2 text-sm whitespace-nowrap">
                      {r.report_url ? (
                        <a
                          href={r.report_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:underline"
                        >
                          開く
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
