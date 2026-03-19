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
  return `${s.getMonth() + 1}/${s.getDate()}\u301C${e.getMonth() + 1}/${e.getDate()}`;
};

function renderKpt(items: string[] | null) {
  if (!items || items.length === 0) return "-";
  return (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        <div key={i} className="text-sm text-gray-300 leading-snug">
          <span className="text-gray-500">{"\u30FB"}</span>
          {item}
        </div>
      ))}
    </div>
  );
}

type Tab = "google" | "meta";

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
      const windowStart = Math.max(0, i - 7); // 過去8週分（自分含む）
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          {"\u5E83\u544A\u5206\u6790\u30EC\u30DD\u30FC\u30C8"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {"\u9031\u6B21\u5E83\u544A\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9\u30EC\u30DD\u30FC\u30C8"}
        </p>
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

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {"\u30EC\u30DD\u30FC\u30C8\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full">
            <thead className="sticky top-0 z-10 bg-surface-raised">
              <tr>
                {[
                  "\u671F\u9593",
                  "\u8CBB\u7528",
                  "Imp",
                  "Click",
                  "CPC",
                  "CTR",
                  "\u7533\u8FBC\u6570",
                  "\u7533\u8FBCCPA",
                  "\u65E5\u7A0B\u78BA\u5B9A",
                  "\u6210\u7D04\u6570",
                  "\u58F2\u4E0A",
                  "ROAS(8\u9031)",
                  "Keep",
                  "Problem",
                  "Try",
                  "\u30EC\u30DD\u30FC\u30C8",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr
                  key={r.id ?? idx}
                  className={`border-b border-white/5 ${
                    idx % 2 === 0 ? "bg-surface-card" : "bg-surface-raised/50"
                  } hover:bg-white/5 transition-colors`}
                >
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap">
                    {fmtWeek(r.week_start, r.week_end)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtCurrency(r.cost)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtNum(r.impressions)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtNum(r.clicks)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtCurrency(r.cpc)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtPct(r.ctr)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtNum(r.applications)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtCurrency(r.application_cpa)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtNum(r.schedules)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtNum(r.contracts)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtCurrency(r.revenue)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-200 whitespace-nowrap text-right">
                    {fmtRoas(rollingRoasMap.get(r.week_start) ?? null)}
                  </td>
                  <td className="px-3 py-2 whitespace-normal min-w-[150px] max-w-[200px]">
                    {renderKpt(r.keeps)}
                  </td>
                  <td className="px-3 py-2 whitespace-normal min-w-[150px] max-w-[200px]">
                    {renderKpt(r.problems)}
                  </td>
                  <td className="px-3 py-2 whitespace-normal min-w-[150px] max-w-[200px]">
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
                        {"\u958B\u304F"}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
