"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { SalesCostReportRow } from "./sales-cost-section";

// ── 色定義 ──
const PERSON_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316",
];

// ── コストルール ──
function isShinsotsu(attr: string): boolean {
  return attr.includes("卒") && !attr.includes("既卒");
}

function calcCost(salesPerson: string, attribute: string): number {
  if (salesPerson === "田中") return 9000;
  if (isShinsotsu(attribute)) return 3000;
  // 既卒・中途 or 不明 → ¥4,000
  return 4000;
}

// ── 月キー生成 ──
function getMonthKeys(count: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function toMonthKey(dateStr: string): string {
  const parts = dateStr.replace(/-/g, "/").split("/");
  if (parts.length >= 2) return `${parts[0]}/${parts[1].padStart(2, "0")}`;
  return dateStr.slice(0, 7).replace("-", "/");
}

function fmtYen(v: number): string {
  if (v >= 10000) return `¥${(v / 10000).toFixed(1)}万`;
  return `¥${v.toLocaleString()}`;
}

interface SalesCostClientProps {
  reports: SalesCostReportRow[];
  emailChannelMap: Record<string, string>;
}

export function SalesCostClient({ reports, emailChannelMap }: SalesCostClientProps) {
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  // チャネルのトップ6を算出
  const channelOptions = useMemo(() => {
    const channelCounts = new Map<string, number>();
    for (const r of reports) {
      const ch = emailChannelMap[r.customerEmail.toLowerCase()] || null;
      if (ch) channelCounts.set(ch, (channelCounts.get(ch) || 0) + 1);
    }
    return Array.from(channelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
  }, [reports, emailChannelMap]);

  // フィルタ済みレポート
  const filteredReports = useMemo(() => {
    if (!selectedChannel) return reports;
    return reports.filter(r => {
      const ch = emailChannelMap[r.customerEmail.toLowerCase()];
      return ch === selectedChannel;
    });
  }, [reports, emailChannelMap, selectedChannel]);

  // 月キー（直近12ヶ月）
  const months = useMemo(() => getMonthKeys(12), []);

  // 担当者別コスト集計 → top5 + その他
  const { chartData, personNames, totalCost } = useMemo(() => {
    // 担当者別の合計コスト
    const personTotal = new Map<string, number>();
    // 月×担当者のコスト
    const monthPerson = new Map<string, Map<string, number>>();
    for (const m of months) monthPerson.set(m, new Map());

    for (const r of filteredReports) {
      const month = toMonthKey(r.date);
      if (!months.includes(month)) continue;
      const cost = calcCost(r.salesPerson, r.attribute);
      personTotal.set(r.salesPerson, (personTotal.get(r.salesPerson) || 0) + cost);
      const mp = monthPerson.get(month);
      if (mp) mp.set(r.salesPerson, (mp.get(r.salesPerson) || 0) + cost);
    }

    // top5 by total cost
    const sorted = Array.from(personTotal.entries()).sort((a, b) => b[1] - a[1]);
    const topNames = sorted.slice(0, 5).map(([name]) => name);
    const topSet = new Set(topNames);
    const hasOthers = sorted.length > 5;
    const names = hasOthers ? [...topNames, "その他"] : topNames;

    let total = 0;

    const data = months.map(m => {
      const row: Record<string, string | number> = { month: m };
      const mp = monthPerson.get(m) || new Map();
      let othersSum = 0;
      for (const [person, cost] of mp) {
        if (topSet.has(person)) {
          row[person] = (row[person] as number || 0) + cost;
        } else {
          othersSum += cost;
        }
        total += cost;
      }
      // 名前が無い月は 0 にする
      for (const name of topNames) {
        if (!(name in row)) row[name] = 0;
      }
      if (hasOthers) row["その他"] = othersSum;
      return row;
    });

    return { chartData: data, personNames: names, totalCost: total };
  }, [filteredReports, months]);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">営業コスト試算（直近12ヶ月）</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            田中: ¥9,000/回 / 他スタッフ: 新卒¥3,000・既卒¥4,000
          </p>
        </div>
        <span className="text-lg font-bold text-white">
          {fmtYen(totalCost)}
          <span className="text-[10px] text-gray-400 ml-1">合計</span>
        </span>
      </div>

      {/* チャネルフィルタ */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          onClick={() => setSelectedChannel(null)}
          className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
            selectedChannel === null
              ? "bg-brand text-white"
              : "bg-white/5 text-gray-400 hover:text-white"
          }`}
        >
          全体
        </button>
        {channelOptions.map(ch => (
          <button
            key={ch}
            onClick={() => setSelectedChannel(ch)}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
              selectedChannel === ch
                ? "bg-brand text-white"
                : "bg-white/5 text-gray-400 hover:text-white"
            }`}
          >
            {ch}
          </button>
        ))}
      </div>

      {/* チャート */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 9, fill: "#6b7280" }}
            tickFormatter={(v: string) => v.slice(5) + "月"}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#6b7280" }}
            width={45}
            tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : `${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 11,
            }}
            labelStyle={{ color: "#e5e7eb", fontWeight: 600 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            labelFormatter={(label: any) => `${label}`}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => {
              const v = Number(value);
              if (v === 0) return [null, null];
              return [`¥${v.toLocaleString()}`, name];
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            itemSorter={(item: any) => -(item.value || 0)}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {personNames.map((name, i) => (
            <Bar
              key={name}
              dataKey={name}
              stackId="cost"
              fill={name === "その他" ? "#6b7280" : PERSON_COLORS[i % PERSON_COLORS.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
