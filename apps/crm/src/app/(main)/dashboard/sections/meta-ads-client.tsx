"use client";

import { useState, useMemo } from "react";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ComposedChart, Bar,
} from "recharts";

export interface MetaAdsRow {
  period: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  link_clicks: number;
  landing_page_views: number;
  cv_custom: number;
}

interface Props {
  weeklyRows: MetaAdsRow[];
  monthlyRows: MetaAdsRow[];
}

type Granularity = "weekly" | "monthly";
type ViewMode = "chart" | "table";

function yAxisFmt(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(0)}万`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}千`;
  return String(v);
}

export function MetaAdsSummaryClient({ weeklyRows, monthlyRows }: Props) {
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [viewMode, setViewMode] = useState<ViewMode>("chart");
  const rows = granularity === "weekly" ? weeklyRows : monthlyRows;

  // Chart data needs ascending order
  const chartData = useMemo(() => [...rows].reverse().map(r => ({
    ...r,
    label: granularity === "weekly" ? r.period.slice(5) : r.period,
  })), [rows, granularity]);

  // Period totals
  const totals = rows.reduce((acc, r) => ({
    spend: acc.spend + r.spend,
    impressions: acc.impressions + r.impressions,
    clicks: acc.clicks + r.clicks,
    link_clicks: acc.link_clicks + r.link_clicks,
    landing_page_views: acc.landing_page_views + r.landing_page_views,
    cv_custom: acc.cv_custom + r.cv_custom,
  }), { spend: 0, impressions: 0, clicks: 0, link_clicks: 0, landing_page_views: 0, cv_custom: 0 });

  const totalCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const totalCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Meta広告パフォーマンス</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">Meta Ads 経由の広告費・クリック・CV</p>
            </div>
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
                <button onClick={() => setViewMode("chart")}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${viewMode === "chart" ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                  グラフ
                </button>
                <button onClick={() => setViewMode("table")}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${viewMode === "table" ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                  テーブル
                </button>
              </div>
              {/* Granularity toggle */}
              <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
                {([["weekly", "週別"], ["monthly", "月別"]] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setGranularity(v)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${granularity === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chart view */}
        {viewMode === "chart" && chartData.length > 0 && (
          <div className="p-5">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }}
                  interval={Math.max(Math.floor(chartData.length / 10), 0)} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={yAxisFmt} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#9ca3af" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => {
                    const v = Number(value);
                    return [v > 0 ? `¥${Math.round(v).toLocaleString()}` : "—", name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="spend" name="広告費" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Table view */}
        {viewMode === "table" && (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-card z-10">
                <tr className="border-b border-white/10 text-gray-400">
                  <th className="text-left py-2.5 px-4 w-28">
                    {granularity === "weekly" ? "週" : "月"}
                  </th>
                  <th className="text-right py-2.5 px-3">広告費</th>
                  <th className="text-right py-2.5 px-3">imp</th>
                  <th className="text-right py-2.5 px-3">click</th>
                  <th className="text-right py-2.5 px-3">CTR</th>
                  <th className="text-right py-2.5 px-3">CPC</th>
                  <th className="text-right py-2.5 px-3">link click</th>
                  <th className="text-right py-2.5 px-3">LP view</th>
                  <th className="text-right py-2.5 px-3">CV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.period} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4 text-white font-medium">
                      {granularity === "weekly" ? r.period.slice(5) : r.period}
                    </td>
                    <td className="text-right py-2.5 px-3 text-white">
                      {r.spend > 0 ? `¥${r.spend.toLocaleString()}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-300">
                      {r.impressions > 0 ? r.impressions.toLocaleString() : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-300">
                      {r.clicks > 0 ? r.clicks.toLocaleString() : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-400">
                      {r.ctr > 0 ? `${r.ctr.toFixed(2)}%` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-400">
                      {r.cpc > 0 ? `¥${Math.round(r.cpc).toLocaleString()}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.link_clicks > 0 ? "text-blue-400" : "text-gray-600"}>
                        {r.link_clicks > 0 ? r.link_clicks.toLocaleString() : "—"}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.landing_page_views > 0 ? "text-cyan-400" : "text-gray-600"}>
                        {r.landing_page_views > 0 ? r.landing_page_views.toLocaleString() : "—"}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.cv_custom > 0 ? "text-green-400 font-medium" : "text-gray-600"}>
                        {r.cv_custom > 0 ? r.cv_custom.toFixed(1) : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-gray-500">データなし</td></tr>
                )}
                {rows.length > 0 && (
                  <tr className="border-t border-white/20 bg-white/5 font-medium sticky bottom-0">
                    <td className="py-2.5 px-4 text-white">合計</td>
                    <td className="text-right py-2.5 px-3 text-white">¥{totals.spend.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-white">{totals.impressions.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-white">{totals.clicks.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-white">{totalCtr.toFixed(2)}%</td>
                    <td className="text-right py-2.5 px-3 text-white">{totalCpc > 0 ? `¥${Math.round(totalCpc).toLocaleString()}` : "—"}</td>
                    <td className="text-right py-2.5 px-3 text-blue-400">{totals.link_clicks.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-cyan-400">{totals.landing_page_views.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-green-400">{totals.cv_custom.toFixed(1)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
