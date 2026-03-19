"use client";

import { useState, useMemo } from "react";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Line, ComposedChart, Bar, BarChart, Scatter,
} from "recharts";

const CAMPAIGN_COLORS = ["#FBBC04", "#4285F4", "#EA4335", "#34A853", "#FF6D01", "#46BDC6", "#AB47BC", "#7CB342"];

export interface ClosedCustomerInfo {
  name: string;
  ltv: number;
}

export interface AdsWeeklyRow {
  period: string;
  cost: number;
  cv_application: number;
  scheduled: number;
  closed: number;
  revenue: number;
  cpa_scheduled: number;
  rolling_ltv: number;
  closedCustomers?: ClosedCustomerInfo[];
}

export interface CampaignDailyRow {
  date: string;
  campaign_name: string;
  cost: number;
}

interface Props {
  weeklyRows: AdsWeeklyRow[];
  monthlyRows: AdsWeeklyRow[];
  campaignDaily?: CampaignDailyRow[];
}

type Granularity = "weekly" | "monthly";
type ViewMode = "chart" | "table";

function periodStartDate12m(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setMonth(d.getMonth() - 12);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  // "2025-09-20" → "2025/09/20", "2025-09" → "2025/09"
  return dateStr.replace(/-/g, "/");
}

function weekKeyLocal(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

function yAxisFmt(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(0)}万`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}千`;
  return String(v);
}

export function AdsSummaryClient({ weeklyRows, monthlyRows, campaignDaily = [] }: Props) {
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [viewMode, setViewMode] = useState<ViewMode>("chart");

  // 12ヶ月固定フィルタ
  const rows = useMemo(() => {
    const source = granularity === "weekly" ? weeklyRows : monthlyRows;
    const start = periodStartDate12m();
    return source.filter(r => r.period >= start);
  }, [granularity, weeklyRows, monthlyRows]);

  // Chart data needs ascending order
  const chartData = useMemo(() => [...rows].reverse().map(r => ({
    ...r,
    label: granularity === "weekly" ? r.period.slice(5) : r.period,
  })), [rows, granularity]);

  // Campaign stacked chart data
  const { stackedData, campaignNames } = useMemo(() => {
    if (campaignDaily.length === 0) return { stackedData: [], campaignNames: [] };
    const startDate = periodStartDate12m();
    const filtered = campaignDaily.filter(r => r.date >= startDate);

    // Group by week or month
    const dateMap = new Map<string, Record<string, number>>();
    const campSet = new Set<string>();
    for (const r of filtered) {
      if (r.cost <= 0) continue;
      const key = granularity === "weekly" ? weekKeyLocal(r.date) : r.date.slice(0, 7);
      campSet.add(r.campaign_name);
      const ex = dateMap.get(key) || {};
      ex[r.campaign_name] = (ex[r.campaign_name] || 0) + r.cost;
      dateMap.set(key, ex);
    }
    const camps = Array.from(campSet).sort();
    const data = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        label: granularity === "weekly" ? date.slice(5) : date,
        ...vals,
      }));
    return { stackedData: data, campaignNames: camps };
  }, [campaignDaily, granularity]);

  // Period totals
  const totals = rows.reduce((acc, r) => ({
    cost: acc.cost + r.cost,
    cv_application: acc.cv_application + r.cv_application,
    scheduled: acc.scheduled + r.scheduled,
    closed: acc.closed + r.closed,
    revenue: acc.revenue + r.revenue,
  }), { cost: 0, cv_application: 0, scheduled: 0, closed: 0, revenue: 0 });

  const totalCpaScheduled = totals.scheduled > 0 ? Math.round(totals.cost / totals.scheduled) : 0;

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 min-h-[72px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Google広告パフォーマンス</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">
                帰属チャネル: Google広告（直近12ヶ月）
              </p>
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

        {/* Combined chart: stacked campaign bars + CPA/LTV lines */}
        {viewMode === "chart" && stackedData.length > 0 && (
          <div className="p-5">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={(() => {
                // Merge stacked campaign data with CPA/LTV line data
                const lineMap = new Map(chartData.map(r => [r.label, r]));
                return stackedData.map(d => ({ ...d, ...(lineMap.get(d.label) || {}) }));
              })()}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }}
                  interval={Math.max(Math.floor(stackedData.length / 12), 1)} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#6b7280" }}
                  tickFormatter={(v: number) => v >= 10000 ? `${(v/10000).toFixed(1)}万` : `¥${Math.round(v)}`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={yAxisFmt} hide />
                <YAxis yAxisId="closedAxis" orientation="right" domain={[0, 10]} tick={{ fontSize: 9, fill: "#fbbf24" }} allowDecimals={false} width={20} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#9ca3af" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const dataPoint = payload[0]?.payload;
                    const customers: ClosedCustomerInfo[] = dataPoint?.closedCustomers || [];
                    return (
                      <div style={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                        <p style={{ color: "#9ca3af", marginBottom: 4 }}>{label}</p>
                        {payload.filter((p: { value: number }) => p.value > 0).map((p: { name: string; value: number; color: string }, i: number) => (
                          <p key={i} style={{ color: p.color || "#fff", margin: "2px 0" }}>
                            {p.name}: {typeof p.value === "number" && p.name !== "成約" ? `¥${Math.round(p.value).toLocaleString()}` : p.value}
                          </p>
                        ))}
                        {customers.length > 0 && (
                          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 6, paddingTop: 6 }}>
                            <p style={{ color: "#fbbf24", fontWeight: 600, marginBottom: 2 }}>成約顧客:</p>
                            {customers.map((c, i) => (
                              <p key={i} style={{ color: "#e5e7eb", margin: "1px 0", fontSize: 11 }}>
                                {c.name} — ¥{c.ltv.toLocaleString()}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {campaignNames.map((camp, i) => (
                  <Bar key={camp} yAxisId="left" dataKey={camp} stackId="cost" fill={CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length]}
                    name={camp.length > 20 ? camp.slice(0, 18) + "…" : camp} />
                ))}
                <Line yAxisId="right" type="monotone" dataKey="cpa_scheduled" name="日程確定CPA(2ヶ月移動)" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="rolling_ltv" name="確定LTV(2ヶ月移動)" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="6 3" />
                <Scatter yAxisId="closedAxis" dataKey="closed" name="成約" fill="#fbbf24" shape="circle" legendType="circle" />
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
                  <th className="text-right py-2.5 px-3">申し込み</th>
                  <th className="text-right py-2.5 px-3">日程確定</th>
                  <th className="text-right py-2.5 px-3">成約</th>
                  <th className="text-right py-2.5 px-3">
                    <span>日程確定CPA</span>
                    <span className="block text-[9px] text-gray-500 font-normal">(2ヶ月移動平均)</span>
                  </th>
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
                      {r.cost > 0 ? `¥${r.cost.toLocaleString()}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.cv_application > 0 ? "text-green-400" : "text-gray-600"}>
                        {r.cv_application > 0 ? r.cv_application : "—"}
                      </span>
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
                  <tr><td colSpan={8} className="py-8 text-center text-gray-500">データなし</td></tr>
                )}
                {rows.length > 0 && (
                  <tr className="border-t border-white/20 bg-white/5 font-medium sticky bottom-0">
                    <td className="py-2.5 px-4 text-white">合計</td>
                    <td className="text-right py-2.5 px-3 text-white">¥{totals.cost.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-green-400">{totals.cv_application}</td>
                    <td className="text-right py-2.5 px-3 text-blue-400">{totals.scheduled}</td>
                    <td className="text-right py-2.5 px-3 text-amber-400">{totals.closed}</td>
                    <td className="text-right py-2.5 px-3 text-white">{totalCpaScheduled > 0 ? `¥${totalCpaScheduled.toLocaleString()}` : "—"}</td>
                    <td className="text-right py-2.5 px-3 text-gray-500">—</td>
                    <td className="text-right py-2.5 px-3 text-white">¥{totals.revenue.toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {/* 注釈 */}
            <div className="px-4 py-2 border-t border-white/5 text-[10px] text-gray-500">
              <span>※ 申し込み = 帰属チャネル「Google広告」の顧客DB登録数</span>
              <span className="ml-3">※ 日程確定CPA = 広告費 ÷ 日程確定数（2ヶ月移動平均）</span>
            </div>
          </div>
        )}
    </div>
  );
}
