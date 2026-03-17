"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { SalesReportRow } from "./sales-rate-section";

const PERSON_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
  "#14b8a6", "#e11d48",
];

type AttrFilter = "all" | "kisotsu" | "shinsotsu";

function isShinsotsuAttr(attr: string): boolean {
  return attr.includes("卒") && !attr.includes("既卒");
}

function isKisotsuAttr(attr: string): boolean {
  return attr.includes("既卒") || attr.includes("中途");
}

interface SalesRateClientProps {
  reports: SalesReportRow[];
}

export function SalesRateClient({ reports }: SalesRateClientProps) {
  const [attrFilter, setAttrFilter] = useState<AttrFilter>("all");
  const MIN_TOTAL = 10;

  const { chartData, salesPersons, personSummaries } = useMemo(() => {
    // Filter by attribute
    let filtered = reports;
    if (attrFilter === "kisotsu") filtered = reports.filter(r => isKisotsuAttr(r.attribute));
    else if (attrFilter === "shinsotsu") filtered = reports.filter(r => isShinsotsuAttr(r.attribute));

    // Normalize date to month format "YYYY/MM"
    const toMonth = (d: string) => {
      // Handle "2026/03/14" or "2026-03-14"
      const parts = d.replace(/-/g, "/").split("/");
      if (parts.length >= 2) return `${parts[0]}/${parts[1].padStart(2, "0")}`;
      return d.slice(0, 7).replace("-", "/");
    };

    // Count total per sales person (for filter)
    const totalByPerson = new Map<string, number>();
    for (const r of filtered) {
      totalByPerson.set(r.salesPerson, (totalByPerson.get(r.salesPerson) || 0) + 1);
    }

    // Filter to persons with >= MIN_TOTAL
    const qualifiedPersons = new Set<string>();
    for (const [sp, count] of totalByPerson) {
      if (count >= MIN_TOTAL) qualifiedPersons.add(sp);
    }

    // Build month × person → { denom, numer }
    const raw = new Map<string, Map<string, { denom: number; numer: number }>>();

    for (const r of filtered) {
      if (!qualifiedPersons.has(r.salesPerson)) continue;
      const month = toMonth(r.date);

      if (!raw.has(r.salesPerson)) raw.set(r.salesPerson, new Map());
      const personMap = raw.get(r.salesPerson)!;
      if (!personMap.has(month)) personMap.set(month, { denom: 0, numer: 0 });
      const m = personMap.get(month)!;

      m.denom++;
      if (r.result === "成約") m.numer++;
    }

    // Generate 12 months + 2 for rolling
    const now = new Date();
    const allMonths: string[] = [];
    for (let i = 14; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      allMonths.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const displayMonths = allMonths.slice(3); // last 12

    // Compute rolling 3-month averages
    const persons = Array.from(qualifiedPersons).sort();
    const chart = displayMonths.map(month => {
      const row: Record<string, string | number> = { month };
      const idx = allMonths.indexOf(month);

      for (const sp of persons) {
        const personMap = raw.get(sp);
        if (!personMap) continue;

        let rollingDenom = 0, rollingNumer = 0;
        for (let j = 0; j < 3; j++) {
          const m = allMonths[idx - j];
          if (m) {
            const data = personMap.get(m);
            if (data) {
              rollingDenom += data.denom;
              rollingNumer += data.numer;
            }
          }
        }
        if (rollingDenom > 0) {
          row[sp] = Math.round((rollingNumer / rollingDenom) * 1000) / 10;
        }
      }
      return row;
    });

    // Summaries: latest month's rolling rate
    const latestMonth = displayMonths[displayMonths.length - 1];
    const latestIdx = allMonths.indexOf(latestMonth);
    const summaries = persons.map(sp => {
      const personMap = raw.get(sp);
      let rollingDenom = 0, rollingNumer = 0;
      if (personMap) {
        for (let j = 0; j < 3; j++) {
          const m = allMonths[latestIdx - j];
          if (m) {
            const data = personMap.get(m);
            if (data) {
              rollingDenom += data.denom;
              rollingNumer += data.numer;
            }
          }
        }
      }
      return {
        name: sp,
        latestRate: rollingDenom > 0 ? Math.round((rollingNumer / rollingDenom) * 1000) / 10 : 0,
        latestDenom: rollingDenom,
        latestNumer: rollingNumer,
        totalCount: totalByPerson.get(sp) || 0,
      };
    }).sort((a, b) => b.latestRate - a.latestRate);

    return { chartData: chart, salesPersons: persons, personSummaries: summaries };
  }, [reports, attrFilter]);

  const attrLabel = attrFilter === "all" ? "全体" : attrFilter === "kisotsu" ? "既卒" : "新卒";

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">営業マン別 成約率（3ヶ月移動平均）</h2>
          <p className="text-[10px] text-gray-500">データソース: 営業報告フォーム / 分母: 面談実施 / 分子: 成約 / {attrLabel}</p>
        </div>
        <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
          {([["all", "合計"], ["kisotsu", "既卒"], ["shinsotsu", "新卒"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setAttrFilter(v)}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                attrFilter === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {personSummaries.map((ps) => (
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
      {salesPersons.length > 0 ? (
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
      ) : (
        <p className="text-xs text-gray-500 text-center py-8">対象データなし（{MIN_TOTAL}件以上の営業マンがいません）</p>
      )}
    </div>
  );
}
