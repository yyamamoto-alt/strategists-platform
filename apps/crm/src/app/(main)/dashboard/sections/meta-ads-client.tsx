"use client";

import { useState, useMemo } from "react";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Line, ComposedChart, Bar,
} from "recharts";

export interface MetaAdsRow {
  period: string;
  spend: number;
  scheduled: number;
  closed: number;
  revenue: number;
  cpa_scheduled: number;
  rolling_ltv: number;
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
    scheduled: acc.scheduled + r.scheduled,
    closed: acc.closed + r.closed,
    revenue: acc.revenue + r.revenue,
  }), { spend: 0, scheduled: 0, closed: 0, revenue: 0 });

  const totalCpaScheduled = totals.scheduled > 0 ? Math.round(totals.spend / totals.scheduled) : 0;

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 min-h-[72px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Meta広告パフォーマンス</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">帰属チャネル: Meta広告</p>
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
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={yAxisFmt} domain={[0, 200000]} />
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
                <Line type="monotone" dataKey="cpa_scheduled" name="CPA(2ヶ月移動)" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="rolling_ltv" name="確定LTV(2ヶ月移動)" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="6 3" />
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
                  <th className="text-right py-2.5 px-3">日程確定</th>
                  <th className="text-right py-2.5 px-3">成約</th>
                  <th className="text-right py-2.5 px-3">CPA(2ヶ月移動)</th>
                  <th className="text-right py-2.5 px-3">確定LTV</th>
                  <th className="text-right py-2.5 px-3">売上</th>
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
                    <td className="text-right py-2.5 px-3">
                      <span className={r.scheduled > 0 ? "text-blue-400 font-medium" : "text-gray-600"}>
                        {r.scheduled > 0 ? r.scheduled : "—"}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.closed > 0 ? "text-amber-400 font-medium" : "text-gray-600"}>
                        {r.closed > 0 ? r.closed : "—"}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-300">
                      {r.cpa_scheduled > 0 ? `¥${r.cpa_scheduled.toLocaleString()}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.rolling_ltv > 0 ? "text-green-400" : "text-gray-600"}>
                        {r.rolling_ltv > 0 ? `¥${r.rolling_ltv.toLocaleString()}` : "—"}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.revenue > 0 ? "text-white" : "text-gray-600"}>
                        {r.revenue > 0 ? `¥${r.revenue.toLocaleString()}` : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-500">データなし</td></tr>
                )}
                {rows.length > 0 && (
                  <tr className="border-t border-white/20 bg-white/5 font-medium sticky bottom-0">
                    <td className="py-2.5 px-4 text-white">合計</td>
                    <td className="text-right py-2.5 px-3 text-white">¥{totals.spend.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-blue-400">{totals.scheduled}</td>
                    <td className="text-right py-2.5 px-3 text-amber-400">{totals.closed}</td>
                    <td className="text-right py-2.5 px-3 text-white">{totalCpaScheduled > 0 ? `¥${totalCpaScheduled.toLocaleString()}` : "—"}</td>
                    <td className="text-right py-2.5 px-3 text-gray-500">—</td>
                    <td className="text-right py-2.5 px-3 text-white">¥{totals.revenue.toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
