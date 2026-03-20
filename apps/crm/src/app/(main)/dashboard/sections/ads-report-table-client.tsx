"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

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

type HeatDirection = "higher-better" | "lower-better" | "neutral";

function calcHeatBg(value: number | null, min: number, max: number, direction: HeatDirection): string {
  if (value == null || min === max) return "";
  const ratio = (value - min) / (max - min);
  if (direction === "higher-better") {
    const r = Math.round(80 + (1 - ratio) * 60);
    const g = Math.round(80 + ratio * 80);
    const b = Math.round(80);
    return `rgba(${r - 80}, ${g - 30}, ${b - 60}, ${0.15 + ratio * 0.25})`;
  } else if (direction === "lower-better") {
    const inv = 1 - ratio;
    const r = Math.round(80 + ratio * 60);
    const g = Math.round(80 + inv * 80);
    const b = Math.round(80);
    return `rgba(${r - 80}, ${g - 30}, ${b - 60}, ${0.15 + (1 - inv) * 0.25})`;
  } else {
    const intensity = Math.abs(ratio - 0.5) * 2;
    return `rgba(99, 102, 241, ${0.05 + intensity * 0.25})`;
  }
}

function renderKpt(items: string[] | null) {
  if (!items || items.length === 0) return <span className="text-gray-600">-</span>;
  return (
    <div className="space-y-0">
      {items.map((item, i) => (
        <div key={i} className="text-[10px] text-gray-300 leading-tight">
          <span className="text-gray-500">・</span>{item}
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
  if (!details?.contracts || details.contracts.length === 0) return "";
  return details.contracts
    .map((c) => `${c.name}: ¥${((c as { revenue?: number }).revenue || 0).toLocaleString()}`)
    .join("\n");
}

interface HeatCol {
  key: string;
  direction: HeatDirection;
  getValue: (r: AdsWeeklyReport) => number | null;
}

const HEAT_COLS: HeatCol[] = [
  { key: "cost", direction: "neutral", getValue: (r) => r.cost },
  { key: "applications", direction: "higher-better", getValue: (r) => r.applications },
  { key: "schedules", direction: "higher-better", getValue: (r) => r.schedules },
  { key: "roas", direction: "higher-better", getValue: () => null },
];

type Tab = "google" | "meta";

export function AdsReportTableClient({ reports }: { reports: AdsWeeklyReport[] }) {
  const [activeTab, setActiveTab] = useState<Tab>("google");

  const filtered = useMemo(() => {
    const byPlatform = reports.filter((r) =>
      activeTab === "google"
        ? r.platform?.toLowerCase() === "google"
        : r.platform?.toLowerCase() === "meta"
    );
    const sorted = [...byPlatform].sort((a, b) => b.week_start.localeCompare(a.week_start));
    return sorted.slice(0, 2);
  }, [reports, activeTab]);

  // 8週ローリングROAS（全データから算出）
  const rollingRoasMap = useMemo(() => {
    const all = reports
      .filter((r) => activeTab === "google" ? r.platform?.toLowerCase() === "google" : r.platform?.toLowerCase() === "meta")
      .sort((a, b) => a.week_start.localeCompare(b.week_start));
    const map = new Map<string, number | null>();
    for (let i = 0; i < all.length; i++) {
      const windowStart = Math.max(0, i - 7);
      let totalCost = 0, totalRevenue = 0;
      for (let j = windowStart; j <= i; j++) {
        totalCost += all[j].cost ?? 0;
        totalRevenue += all[j].revenue ?? 0;
      }
      map.set(all[i].week_start, totalCost > 0 ? totalRevenue / totalCost : null);
    }
    return map;
  }, [reports, activeTab]);

  const heatRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const col of HEAT_COLS) {
      const values = filtered
        .map((r) => col.key === "roas" ? (rollingRoasMap.get(r.week_start) ?? null) : col.getValue(r))
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
    <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-white">広告週次レポート</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("google")}
              className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
                activeTab === "google"
                  ? "bg-brand text-white"
                  : "text-gray-400 hover:text-gray-300 hover:bg-white/5"
              }`}
            >
              Google
            </button>
            <button
              onClick={() => setActiveTab("meta")}
              className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
                activeTab === "meta"
                  ? "bg-brand text-white"
                  : "text-gray-400 hover:text-gray-300 hover:bg-white/5"
              }`}
            >
              Meta
            </button>
          </div>
        </div>
        <Link href="/ads-reports" className="text-[10px] text-brand hover:underline">
          すべて見る →
        </Link>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-500">データなし</div>
      ) : (
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[70px]" />
            <col className="w-[130px]" />
            <col className="w-[70px]" />
            <col className="w-[70px]" />
            <col className="w-[110px]" />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              {["期間", "費用/配信", "申込", "日程確定", "成約/売上", "Keep", "Problem", "Try"].map((h) => (
                <th
                  key={h}
                  className="px-1.5 py-1.5 text-left text-[9px] font-semibold text-gray-500 uppercase tracking-wider border-b border-white/5 whitespace-nowrap"
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
                <tr key={r.id ?? idx} className="border-b border-white/5 hover:bg-white/5 transition-colors align-top">
                  <td className="px-1.5 py-1 whitespace-nowrap">
                    <div className="text-[11px] text-gray-200">{fmtWeek(r.week_start, r.week_end)}</div>
                    {r.report_url ? (
                      <a href={r.report_url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand hover:underline">📄開く</a>
                    ) : null}
                  </td>
                  <td className="px-1.5 py-1 whitespace-nowrap" style={heatStyle("cost", r.cost)}>
                    <div className="text-[11px] font-medium text-gray-200">{fmtCurrency(r.cost)}</div>
                    <div className="text-[9px] text-gray-400">{fmtNum(r.impressions)}imp→{fmtNum(r.clicks)}cl</div>
                    <div className="text-[9px] text-gray-500">CPC{fmtCurrency(r.cpc)}・CTR{fmtPct(r.ctr)}</div>
                  </td>
                  <td className="px-1.5 py-1 whitespace-nowrap" style={heatStyle("applications", r.applications)}>
                    <div className="text-[11px] font-medium text-gray-200 cursor-help" title={customerTooltip(r.customer_details, "applications")}>
                      {fmtNum(r.applications)}件
                    </div>
                    <div className="text-[9px] text-gray-500">{fmtCurrency(r.application_cpa)}</div>
                  </td>
                  <td className="px-1.5 py-1 whitespace-nowrap" style={heatStyle("schedules", r.schedules)}>
                    <div className="text-[11px] font-medium text-gray-200 cursor-help" title={customerTooltip(r.customer_details, "schedules")}>
                      {fmtNum(r.schedules)}件
                    </div>
                    <div className="text-[9px] text-gray-500">{fmtCurrency(r.schedule_cpa)}</div>
                  </td>
                  <td className="px-1.5 py-1 whitespace-nowrap" style={heatStyle("roas", rollingRoas)}>
                    <div className="text-[11px] font-medium text-gray-200 cursor-help" title={customerTooltip(r.customer_details, "contracts")}>
                      成約{fmtNum(r.contracts)}件
                    </div>
                    <div className="text-[11px] text-gray-300 cursor-help" title={revenueTooltip(r.customer_details)}>
                      {fmtCurrency(r.revenue)}
                    </div>
                    <div className="text-[9px] text-gray-500">ROAS {fmtRoas(rollingRoas)}</div>
                  </td>
                  <td className="px-1.5 py-1 whitespace-normal overflow-hidden">
                    {renderKpt(r.keeps)}
                  </td>
                  <td className="px-1.5 py-1 whitespace-normal overflow-hidden">
                    {renderKpt(r.problems)}
                  </td>
                  <td className="px-1.5 py-1 whitespace-normal overflow-hidden">
                    {renderKpt(r.tries)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
