"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { SalesPersonMonthlyRate } from "@/lib/data/dashboard-metrics";

const PERSON_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
  "#14b8a6", "#e11d48",
];

interface SalesRateClientProps {
  rates: SalesPersonMonthlyRate[];
}

export function SalesRateClient({ rates }: SalesRateClientProps) {
  const { chartData, salesPersons } = useMemo(() => {
    // Get unique months and sales persons
    const monthSet = new Set<string>();
    const personSet = new Set<string>();
    for (const r of rates) {
      monthSet.add(r.month);
      personSet.add(r.salesPerson);
    }

    const months = Array.from(monthSet).sort();
    const persons = Array.from(personSet).sort();

    // Build chart data: each month has a value per sales person
    const data = months.map(month => {
      const row: Record<string, string | number> = { month };
      for (const sp of persons) {
        const entry = rates.find(r => r.month === month && r.salesPerson === sp);
        if (entry && entry.rollingDenom > 0) {
          row[sp] = Math.round(entry.rollingRate * 1000) / 10; // percentage with 1 decimal
        }
      }
      return row;
    });

    return { chartData: data, salesPersons: persons };
  }, [rates]);

  // Calculate overall averages for summary
  const personSummaries = useMemo(() => {
    const map = new Map<string, { totalDenom: number; totalNumer: number }>();
    for (const r of rates) {
      // Use only the latest month's rolling values for summary
    }
    // Use all raw data to compute overall rate
    for (const r of rates) {
      if (!map.has(r.salesPerson)) map.set(r.salesPerson, { totalDenom: 0, totalNumer: 0 });
    }
    // Get latest month
    const months = Array.from(new Set(rates.map(r => r.month))).sort();
    const latestMonth = months[months.length - 1];

    return salesPersons.map(sp => {
      const latest = rates.find(r => r.salesPerson === sp && r.month === latestMonth);
      // Get total across all months (not rolling - just sum unique)
      const allMonths = rates.filter(r => r.salesPerson === sp);
      let totalDenom = 0, totalNumer = 0;
      for (const r of allMonths) {
        // Use the per-month raw counts (approximate from rolling)
        // Better: just use latest rolling as summary
      }
      return {
        name: sp,
        latestRate: latest ? Math.round(latest.rollingRate * 1000) / 10 : 0,
        latestDenom: latest?.rollingDenom || 0,
        latestNumer: latest?.rollingNumer || 0,
      };
    }).sort((a, b) => b.latestRate - a.latestRate);
  }, [rates, salesPersons]);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">営業マン別 成約率（3ヶ月移動平均）</h2>
          <p className="text-[10px] text-gray-500">分母: 面談実施数 / 分子: 成約のみ / 10件以上</p>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {personSummaries.map((ps, i) => (
          <div key={ps.name}
            className="rounded border border-white/10 bg-white/[0.02] px-2.5 py-1.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PERSON_COLORS[salesPersons.indexOf(ps.name) % PERSON_COLORS.length] }} />
            <span className="text-[11px] text-gray-300">{ps.name}</span>
            <span className="text-sm font-bold text-white">{ps.latestRate}%</span>
            <span className="text-[10px] text-gray-500">{ps.latestNumer}/{ps.latestDenom}</span>
          </div>
        ))}
      </div>

      {/* Line chart */}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "#6b7280" }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#6b7280" }}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, 100]}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#e5e7eb", fontWeight: 600 }}
            formatter={(value) => [`${Number(value).toFixed(1)}%`, ""]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {salesPersons.map((sp, i) => (
            <Line
              key={sp}
              type="monotone"
              dataKey={sp}
              stroke={PERSON_COLORS[i % PERSON_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
