"use client";

import { useMemo } from "react";
import type { SalesReportRow } from "./sales-rate-section";

function isShinsotsuAttr(attr: string): boolean {
  return attr.includes("卒") && !attr.includes("既卒");
}

function isKisotsuAttr(attr: string): boolean {
  return attr.includes("既卒") || attr.includes("中途");
}

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

  const pm = new Map<string, Map<string, Cell>>();
  for (const r of reports) {
    if (!attrFilter(r.attribute)) continue;
    const month = toMonth(r.date);
    if (!monthKeys.includes(month)) continue;
    if (!pm.has(r.salesPerson)) pm.set(r.salesPerson, new Map());
    const m = pm.get(r.salesPerson)!;
    if (!m.has(month)) m.set(month, { denom: 0, numer: 0 });
    const c = m.get(month)!;
    c.denom++;
    if (r.result === "成約") c.numer++;
  }

  const rows: PersonRow[] = [];
  for (const [name, monthMap] of pm) {
    const total: Cell = { denom: 0, numer: 0 };
    for (const c of monthMap.values()) { total.denom += c.denom; total.numer += c.numer; }
    if (total.denom === 0) continue;
    rows.push({ name, months: monthMap, total });
  }
  rows.sort((a, b) => (b.total.numer / b.total.denom) - (a.total.numer / a.total.denom));
  return rows;
}

function fmt(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "";
}

function MiniTable({ title, rows, months }: { title: string; rows: PersonRow[]; months: string[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="min-w-0">
      <h3 className="text-[11px] font-semibold text-gray-300 mb-1">{title}</h3>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/10 text-gray-500">
            <th className="text-left py-1 px-2 whitespace-nowrap"></th>
            {months.map(m => (
              <th key={m} className="text-center py-1 px-1.5 whitespace-nowrap">{m.slice(5)}月</th>
            ))}
            <th className="text-center py-1 px-1.5 border-l border-white/10 whitespace-nowrap">計</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.name} className="border-b border-white/5">
              <td className="py-1 px-2 text-white font-medium whitespace-nowrap">{row.name}</td>
              {months.map(m => {
                const c = row.months.get(m) || { denom: 0, numer: 0 };
                const rate = c.denom > 0 ? (c.numer / c.denom) * 100 : -1;
                return (
                  <td key={m} className={`text-center py-1 px-1.5 ${rate >= 0 ? heatColor(rate) : ""}`}>
                    {c.denom > 0
                      ? <span className="text-white">{fmt(c.numer, c.denom)}<span className="text-[9px] text-gray-500 ml-0.5">{c.numer}/{c.denom}</span></span>
                      : <span className="text-gray-700">—</span>
                    }
                  </td>
                );
              })}
              <td className={`text-center py-1 px-1.5 border-l border-white/10 ${heatColor((row.total.numer / row.total.denom) * 100)}`}>
                <span className="text-white font-semibold">{fmt(row.total.numer, row.total.denom)}</span>
                <span className="text-[9px] text-gray-500 ml-0.5">{row.total.numer}/{row.total.denom}</span>
              </td>
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
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-white">営業マン別 成約率（直近3ヶ月）</h2>
        <p className="text-[10px] text-gray-500">分母: 面談実施（NoShow・キャンセル・追加指導除外） / 分子: 成約</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <MiniTable title="既卒" rows={kisotsuRows} months={months} />
        <MiniTable title="新卒" rows={shinsotsuRows} months={months} />
      </div>
    </div>
  );
}
