"use client";

import React, { useMemo } from "react";
import type { SalesReportRow } from "./sales-rate-section";

function isShinsotsuAttr(attr: string): boolean {
  return attr.includes("卒") && !attr.includes("既卒");
}

function isKisotsuAttr(attr: string): boolean {
  return attr.includes("既卒") || attr.includes("中途");
}

/** 成約率に応じたヒートマップ背景色 */
function heatColor(rate: number): string {
  if (rate >= 50) return "bg-green-500/40";
  if (rate >= 40) return "bg-green-500/30";
  if (rate >= 30) return "bg-green-500/20";
  if (rate >= 20) return "bg-yellow-500/20";
  if (rate >= 10) return "bg-orange-500/20";
  if (rate > 0) return "bg-red-500/15";
  return "";
}

type Cell = { denom: number; numer: number };

interface PersonRow {
  name: string;
  months: Map<string, Cell>;
  total: Cell;
}

function buildTable(
  reports: SalesReportRow[],
  monthKeys: string[],
  attrFilter: (attr: string) => boolean,
): PersonRow[] {
  const toMonth = (d: string) => {
    const parts = d.replace(/-/g, "/").split("/");
    if (parts.length >= 2) return `${parts[0]}/${parts[1].padStart(2, "0")}`;
    return d.slice(0, 7).replace("-", "/");
  };

  const personMonthData = new Map<string, Map<string, Cell>>();

  for (const r of reports) {
    if (!attrFilter(r.attribute)) continue;
    const month = toMonth(r.date);
    if (!monthKeys.includes(month)) continue;

    if (!personMonthData.has(r.salesPerson)) personMonthData.set(r.salesPerson, new Map());
    const pm = personMonthData.get(r.salesPerson)!;
    if (!pm.has(month)) pm.set(month, { denom: 0, numer: 0 });
    const cell = pm.get(month)!;
    cell.denom++;
    if (r.result === "成約") cell.numer++;
  }

  const rows: PersonRow[] = [];
  for (const [name, monthMap] of personMonthData) {
    const total: Cell = { denom: 0, numer: 0 };
    for (const c of monthMap.values()) {
      total.denom += c.denom;
      total.numer += c.numer;
    }
    if (total.denom === 0) continue;
    rows.push({ name, months: monthMap, total });
  }

  rows.sort((a, b) => {
    const rateA = a.total.denom > 0 ? a.total.numer / a.total.denom : 0;
    const rateB = b.total.denom > 0 ? b.total.numer / b.total.denom : 0;
    return rateB - rateA;
  });

  return rows;
}

function HeatmapTable({ title, rows, months }: { title: string; rows: PersonRow[]; months: string[] }) {
  const fmtRate = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "";
  const fmtFrac = (n: number, d: number) => d > 0 ? `${n}/${d}` : "";

  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-300 mb-2">{title}</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-gray-400">
            <th className="text-left py-2 px-3">営業マン</th>
            {months.map(m => (
              <th key={m} className="text-center py-2 px-2 border-l border-white/5">
                <span className="text-gray-300">{m.slice(5)}月</span>
              </th>
            ))}
            <th className="text-center py-2 px-2 border-l border-white/10">
              <span className="text-white font-semibold">合計</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.name} className="border-b border-white/5 hover:bg-white/5">
              <td className="py-2 px-3">
                <span className="text-white font-medium">{row.name}</span>
              </td>
              {months.map(m => {
                const c = row.months.get(m) || { denom: 0, numer: 0 };
                const rate = c.denom > 0 ? (c.numer / c.denom) * 100 : -1;
                return (
                  <td key={m} className={`text-center py-2 px-2 border-l border-white/5 ${rate >= 0 ? heatColor(rate) : ""}`}>
                    {c.denom > 0 ? (
                      <div>
                        <div className="text-white font-medium">{fmtRate(c.numer, c.denom)}</div>
                        <div className="text-[9px] text-gray-500">{fmtFrac(c.numer, c.denom)}</div>
                      </div>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>
                );
              })}
              {/* 合計 */}
              {(() => {
                const c = row.total;
                const rate = c.denom > 0 ? (c.numer / c.denom) * 100 : -1;
                return (
                  <td className={`text-center py-2 px-2 border-l border-white/10 ${rate >= 0 ? heatColor(rate) : ""}`}>
                    <div>
                      <div className="text-white font-bold">{fmtRate(c.numer, c.denom)}</div>
                      <div className="text-[9px] text-gray-500">{fmtFrac(c.numer, c.denom)}</div>
                    </div>
                  </td>
                );
              })()}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SalesRateClientProps {
  reports: SalesReportRow[];
}

export function SalesRateClient({ reports }: SalesRateClientProps) {
  const months = useMemo(() => {
    const now = new Date();
    const keys: string[] = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return keys;
  }, []);

  const kisotsuRows = useMemo(() => buildTable(reports, months, isKisotsuAttr), [reports, months]);
  const shinsotsuRows = useMemo(() => buildTable(reports, months, isShinsotsuAttr), [reports, months]);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">営業マン別 成約率（直近3ヶ月）</h2>
        <p className="text-[10px] text-gray-500">データソース: 営業報告フォーム / 分母: 面談実施 / 分子: 成約 / 面談0件は非表示</p>
      </div>

      <div className="space-y-6">
        <HeatmapTable title="既卒" rows={kisotsuRows} months={months} />
        <HeatmapTable title="新卒" rows={shinsotsuRows} months={months} />
      </div>
    </div>
  );
}
