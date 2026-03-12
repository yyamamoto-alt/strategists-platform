"use client";

import { useState } from "react";

export interface AdsWeeklyRow {
  period: string;      // "2026-03-10" (week start) or "2026-03" (month)
  cost: number;
  cv_application: number;
  scheduled: number;
  closed: number;
  revenue: number;
  cpa_scheduled: number;
}

interface Props {
  weeklyRows: AdsWeeklyRow[];
  monthlyRows: AdsWeeklyRow[];
  ltvPerScheduled: number;
  rollingScheduled: number;
  rollingRevenue: number;
}

type Granularity = "weekly" | "monthly";

function formatCurrency(v: number): string {
  if (v >= 10000) return `¥${(v / 10000).toFixed(1)}万`;
  return `¥${v.toLocaleString()}`;
}

export function AdsSummaryClient({ weeklyRows, monthlyRows, ltvPerScheduled, rollingScheduled, rollingRevenue }: Props) {
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const rows = granularity === "weekly" ? weeklyRows : monthlyRows;

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
    <div className="px-6">
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">広告パフォーマンス</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">Google Ads 経由の広告費・申し込み・日程確定・成約</p>
          </div>
          <div className="flex items-center gap-3">
            {/* LTV badge */}
            <div className="text-right">
              <p className="text-[10px] text-gray-500">日程確定あたりLTV（直近3ヶ月）</p>
              <p className="text-base font-bold text-amber-400">
                {ltvPerScheduled > 0 ? formatCurrency(ltvPerScheduled) : "—"}
              </p>
              <p className="text-[10px] text-gray-600">
                {rollingScheduled}確定 / 売上{formatCurrency(rollingRevenue)}
              </p>
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

        {/* Table */}
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
                <th className="text-right py-2.5 px-3">CPA（確定）</th>
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
                      {r.cv_application > 0 ? r.cv_application.toFixed(1) : "—"}
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
                    <span className={r.revenue > 0 ? "text-white" : "text-gray-600"}>
                      {r.revenue > 0 ? `¥${r.revenue.toLocaleString()}` : "—"}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-gray-500">データなし</td></tr>
              )}
              {/* Totals row */}
              {rows.length > 0 && (
                <tr className="border-t border-white/20 bg-white/5 font-medium sticky bottom-0">
                  <td className="py-2.5 px-4 text-white">合計</td>
                  <td className="text-right py-2.5 px-3 text-white">¥{totals.cost.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-green-400">{totals.cv_application.toFixed(1)}</td>
                  <td className="text-right py-2.5 px-3 text-blue-400">{totals.scheduled}</td>
                  <td className="text-right py-2.5 px-3 text-amber-400">{totals.closed}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totalCpaScheduled > 0 ? `¥${totalCpaScheduled.toLocaleString()}` : "—"}</td>
                  <td className="text-right py-2.5 px-3 text-white">¥{totals.revenue.toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
