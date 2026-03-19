"use client";

import React, { useMemo } from "react";
import type { SalesReportRow } from "./sales-rate-section";

const PERSON_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
];

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

interface SalesRateClientProps {
  reports: SalesReportRow[];
}

export function SalesRateClient({ reports }: SalesRateClientProps) {
  const { months, rows } = useMemo(() => {
    // 直近3ヶ月を算出
    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const toMonth = (d: string) => {
      const parts = d.replace(/-/g, "/").split("/");
      if (parts.length >= 2) return `${parts[0]}/${parts[1].padStart(2, "0")}`;
      return d.slice(0, 7).replace("-", "/");
    };

    // 営業マン × 月 × 属性 で集計
    type Cell = { denom: number; numer: number };
    type AttrCells = { all: Cell; kisotsu: Cell; shinsotsu: Cell };
    const personMonthData = new Map<string, Map<string, AttrCells>>();

    const zeroCells = (): AttrCells => ({
      all: { denom: 0, numer: 0 },
      kisotsu: { denom: 0, numer: 0 },
      shinsotsu: { denom: 0, numer: 0 },
    });

    for (const r of reports) {
      const month = toMonth(r.date);
      if (!monthKeys.includes(month)) continue;

      if (!personMonthData.has(r.salesPerson)) personMonthData.set(r.salesPerson, new Map());
      const pm = personMonthData.get(r.salesPerson)!;
      if (!pm.has(month)) pm.set(month, zeroCells());
      const cells = pm.get(month)!;

      const isClosed = r.result === "成約" ? 1 : 0;

      // all
      cells.all.denom++;
      cells.all.numer += isClosed;

      // 属性別
      if (isKisotsuAttr(r.attribute)) {
        cells.kisotsu.denom++;
        cells.kisotsu.numer += isClosed;
      } else if (isShinsotsuAttr(r.attribute)) {
        cells.shinsotsu.denom++;
        cells.shinsotsu.numer += isClosed;
      }
    }

    // 3ヶ月合計で分母0の人は除外
    const tableRows: {
      name: string;
      color: string;
      months: Map<string, AttrCells>;
      total: AttrCells;
    }[] = [];

    let colorIdx = 0;
    for (const [name, monthMap] of personMonthData) {
      const total = zeroCells();
      for (const cells of monthMap.values()) {
        for (const key of ["all", "kisotsu", "shinsotsu"] as const) {
          total[key].denom += cells[key].denom;
          total[key].numer += cells[key].numer;
        }
      }
      if (total.all.denom === 0) continue; // 分母0排除

      tableRows.push({
        name,
        color: PERSON_COLORS[colorIdx % PERSON_COLORS.length],
        months: monthMap,
        total,
      });
      colorIdx++;
    }

    // 合計成約率で降順ソート
    tableRows.sort((a, b) => {
      const rateA = a.total.all.denom > 0 ? a.total.all.numer / a.total.all.denom : 0;
      const rateB = b.total.all.denom > 0 ? b.total.all.numer / b.total.all.denom : 0;
      return rateB - rateA;
    });

    return { months: monthKeys, rows: tableRows };
  }, [reports]);

  const fmtRate = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "";
  const fmtFrac = (n: number, d: number) => d > 0 ? `${n}/${d}` : "";

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-white">営業マン別 成約率（直近3ヶ月）</h2>
        <p className="text-[10px] text-gray-500">データソース: 営業報告フォーム / 分母: 面談実施 / 分子: 成約 / 面談0件は非表示</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left py-2 px-3 sticky left-0 bg-surface-card z-10">営業マン</th>
              {months.map(m => (
                <th key={m} colSpan={3} className="text-center py-1 px-1 border-l border-white/5">
                  <span className="text-gray-300">{m.slice(5)}月</span>
                </th>
              ))}
              <th colSpan={3} className="text-center py-1 px-1 border-l border-white/10">
                <span className="text-white font-semibold">合計</span>
              </th>
            </tr>
            <tr className="border-b border-white/5 text-[10px] text-gray-500">
              <th className="sticky left-0 bg-surface-card z-10"></th>
              {[...months, "total"].map(m => (
                <React.Fragment key={m}>
                  <th className="px-1 py-1 text-center border-l border-white/5">全体</th>
                  <th className="px-1 py-1 text-center">既卒</th>
                  <th className="px-1 py-1 text-center">新卒</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.name} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 px-3 sticky left-0 bg-surface-card z-10">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                    <span className="text-white font-medium">{row.name}</span>
                  </div>
                </td>
                {months.map(m => {
                  const cells = row.months.get(m);
                  const all = cells?.all || { denom: 0, numer: 0 };
                  const ki = cells?.kisotsu || { denom: 0, numer: 0 };
                  const sh = cells?.shinsotsu || { denom: 0, numer: 0 };
                  return (
                    <React.Fragment key={m}>
                      {[all, ki, sh].map((c, i) => {
                        const rate = c.denom > 0 ? (c.numer / c.denom) * 100 : -1;
                        return (
                          <td key={i} className={`text-center py-2 px-1 ${i === 0 ? "border-l border-white/5" : ""} ${rate >= 0 ? heatColor(rate) : ""}`}>
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
                    </React.Fragment>
                  );
                })}
                {/* 合計列 */}
                {(() => {
                  const t = row.total;
                  return [t.all, t.kisotsu, t.shinsotsu].map((c, i) => {
                    const rate = c.denom > 0 ? (c.numer / c.denom) * 100 : -1;
                    return (
                      <td key={`total-${i}`} className={`text-center py-2 px-1 ${i === 0 ? "border-l border-white/10" : ""} ${rate >= 0 ? heatColor(rate) : ""}`}>
                        {c.denom > 0 ? (
                          <div>
                            <div className="text-white font-bold">{fmtRate(c.numer, c.denom)}</div>
                            <div className="text-[9px] text-gray-500">{fmtFrac(c.numer, c.denom)}</div>
                          </div>
                        ) : (
                          <span className="text-gray-700">—</span>
                        )}
                      </td>
                    );
                  });
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
