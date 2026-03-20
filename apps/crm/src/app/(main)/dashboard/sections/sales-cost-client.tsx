"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { SalesCostReportRow } from "./sales-cost-section";

// ── 色定義（チャネル別）──
const CHANNEL_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
];

// ── コストルール ──
function isShinsotsu(attr: string): boolean {
  return attr.includes("卒") && !attr.includes("既卒");
}

function calcCost(salesPerson: string, attribute: string): number {
  if (salesPerson === "田中") return 9000;
  if (isShinsotsu(attribute)) return 3000;
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

type AttrFilter = "all" | "kisotsu" | "shinsotsu";

interface SalesCostClientProps {
  reports: SalesCostReportRow[];
  emailChannelMap: Record<string, string>;
}

export function SalesCostClient({ reports, emailChannelMap }: SalesCostClientProps) {
  const [attrFilter, setAttrFilter] = useState<AttrFilter>("all");

  // 月キー（直近12ヶ月）
  const months = useMemo(() => getMonthKeys(12), []);

  // 属性フィルタ適用
  const filteredReports = useMemo(() => {
    if (attrFilter === "all") return reports;
    return reports.filter(r => {
      const shin = isShinsotsu(r.attribute);
      return attrFilter === "shinsotsu" ? shin : !shin;
    });
  }, [reports, attrFilter]);

  // チャネル別コスト集計 → top8 + その他
  const { chartData, channelNames, totalCost } = useMemo(() => {
    const channelTotal = new Map<string, number>();
    const monthChannel = new Map<string, Map<string, number>>();
    for (const m of months) monthChannel.set(m, new Map());

    for (const r of filteredReports) {
      const month = toMonthKey(r.date);
      if (!months.includes(month)) continue;
      const cost = calcCost(r.salesPerson, r.attribute);
      // ピュア/複合を統合（「ピュアFB広告」「複合FB広告」→「FB広告」）
      const rawChannel = emailChannelMap[r.customerEmail.toLowerCase()] || "不明";
      const channel = rawChannel.replace(/^(ピュア|複合)/, "");

      channelTotal.set(channel, (channelTotal.get(channel) || 0) + cost);
      const mc = monthChannel.get(month);
      if (mc) mc.set(channel, (mc.get(channel) || 0) + cost);
    }

    // top8 by total cost
    const sorted = Array.from(channelTotal.entries()).sort((a, b) => b[1] - a[1]);
    const topNames = sorted.slice(0, 8).map(([name]) => name);
    const topSet = new Set(topNames);
    const hasOthers = sorted.length > 8;
    const names = hasOthers ? [...topNames, "その他"] : topNames;

    let total = 0;

    const data = months.map(m => {
      const row: Record<string, string | number> = { month: m };
      const mc = monthChannel.get(m) || new Map();
      let othersSum = 0;
      for (const [ch, cost] of mc) {
        if (topSet.has(ch)) {
          row[ch] = (row[ch] as number || 0) + cost;
        } else {
          othersSum += cost;
        }
        total += cost;
      }
      for (const name of topNames) {
        if (!(name in row)) row[name] = 0;
      }
      if (hasOthers) row["その他"] = othersSum;
      return row;
    });

    return { chartData: data, channelNames: names, totalCost: total };
  }, [filteredReports, emailChannelMap, months]);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">営業コスト試算（直近12ヶ月）</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">チャネル別積み上げ</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white">
            {fmtYen(totalCost)}
            <span className="text-[10px] text-gray-400 ml-1">合計</span>
          </span>
          <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
            {([["all", "全体"], ["kisotsu", "既卒"], ["shinsotsu", "新卒"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setAttrFilter(v)}
                className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${attrFilter === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
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
          {channelNames.map((name, i) => (
            <Bar
              key={name}
              dataKey={name}
              stackId="cost"
              fill={name === "その他" ? "#6b7280" : CHANNEL_COLORS[i % CHANNEL_COLORS.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
