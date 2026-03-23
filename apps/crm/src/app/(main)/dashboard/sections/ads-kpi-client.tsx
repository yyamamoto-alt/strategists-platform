"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { DailyKpiWithCampaigns } from "./ads-kpi-section";

type ViewMode = "chart" | "table";

const CAMPAIGN_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#f59e0b",
  "#10b981", "#ef4444", "#6366f1", "#84cc16", "#f97316",
];

const formatYen = (v: number) => {
  if (v === 0) return "0";
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(0)}万`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}千`;
  return v.toLocaleString();
};

const formatDate = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
};

interface Props {
  title: string;
  data: DailyKpiWithCampaigns[];
  campaignNames: string[];
  /** 検索広告のみフィルター（Google用） */
  defaultSearchOnly?: boolean;
  searchFilterLabel?: string;
}

export function AdsKpiClient({
  title,
  data,
  campaignNames,
  defaultSearchOnly = false,
  searchFilterLabel,
}: Props) {
  const [view, setView] = useState<ViewMode>("chart");
  const [range, setRange] = useState<30 | 60 | 90>(30);
  const [searchOnly, setSearchOnly] = useState(defaultSearchOnly);

  const filtered = useMemo(() => {
    const sliced = data.slice(-range);
    if (!searchOnly) return sliced;
    // 検索広告のみ: 「検索広告」カテゴリのコストのみ残す
    return sliced.map((d) => {
      const searchCost = d.campaignCosts["検索広告"] || 0;
      const searchRatio = d.cost > 0 ? searchCost / d.cost : 0;
      return {
        ...d,
        cost: searchCost,
        clicks: Math.round(d.clicks * searchRatio),
        cpc: Math.round(d.clicks * searchRatio) > 0
          ? Math.round(searchCost / Math.round(d.clicks * searchRatio))
          : 0,
        campaignCosts: { "検索広告": searchCost } as Record<string, number>,
      };
    });
  }, [data, range, searchOnly]);

  // 表示するキャンペーン名（フィルター適用後）
  const visibleCampaigns = useMemo(() => {
    if (searchOnly) return ["検索広告"];
    return campaignNames;
  }, [campaignNames, searchOnly]);

  const cpcMax = useMemo(() => {
    const max = Math.max(...filtered.map((d) => d.cpc), 0);
    return Math.ceil(max / 100) * 100 || 500;
  }, [filtered]);

  const chartData = useMemo(
    () =>
      filtered.map((d) => {
        const row: Record<string, unknown> = {
          date: d.date,
          cost: d.cost,
          clicks: d.clicks,
          cpc: d.cpc,
          cv_display: d.conversions > 0 ? d.conversions : null,
        };
        // キャンペーン別コストをフラットに展開
        for (const name of visibleCampaigns) {
          row[`cost_${name}`] = d.campaignCosts[name] || 0;
        }
        return row;
      }),
    [filtered, visibleCampaigns]
  );

  const summary = useMemo(() => {
    const totalCost = filtered.reduce((s, d) => s + d.cost, 0);
    const totalClicks = filtered.reduce((s, d) => s + d.clicks, 0);
    const totalCV = filtered.reduce((s, d) => s + d.conversions, 0);
    const avgCpc = totalClicks > 0 ? Math.round(totalCost / totalClicks) : 0;
    return { totalCost, totalClicks, totalCV, avgCpc, days: filtered.length };
  }, [filtered]);

  // キャンペーン名の省略表示
  const shortenName = (name: string) =>
    name.length > 15 ? name.slice(0, 13) + "…" : name;

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-2">
          {/* 検索広告のみトグル（Google用） */}
          {searchFilterLabel && (
            <button
              onClick={() => setSearchOnly(!searchOnly)}
              className={`px-2 py-0.5 text-[10px] rounded border ${
                searchOnly
                  ? "bg-blue-600/30 border-blue-500/50 text-blue-300"
                  : "border-white/10 text-gray-500 hover:text-white"
              }`}
            >
              {searchFilterLabel}
            </button>
          )}
          <div className="flex gap-0.5">
            {([30, 60, 90] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2 py-0.5 text-[10px] rounded ${
                  range === r ? "bg-brand text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {r}日
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 border-l border-white/10 pl-2">
            <button
              onClick={() => setView("chart")}
              className={`px-2 py-0.5 text-[10px] rounded ${
                view === "chart" ? "bg-brand text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              グラフ
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-2 py-0.5 text-[10px] rounded ${
                view === "table" ? "bg-brand text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              テーブル
            </button>
          </div>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3">
        <div className="text-center">
          <div className="text-[10px] text-gray-500">広告費</div>
          <div className="text-sm font-bold text-white">¥{summary.totalCost.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-500">クリック</div>
          <div className="text-sm font-bold text-white">{summary.totalClicks.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-500">平均CPC</div>
          <div className="text-sm font-bold text-white">¥{summary.avgCpc.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-500">CV</div>
          <div className="text-sm font-bold text-white">{summary.totalCV}</div>
        </div>
      </div>

      {view === "chart" ? (
        <div className="px-2 pb-3">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 50, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "#9ca3af" }}
                stroke="rgba(255,255,255,0.1)"
                tickFormatter={formatDate}
                interval={Math.max(0, Math.floor(filtered.length / 10) - 1)}
              />
              <YAxis
                yAxisId="cost"
                tickFormatter={formatYen}
                tick={{ fontSize: 9, fill: "#9ca3af" }}
                stroke="rgba(255,255,255,0.1)"
                width={45}
              />
              <YAxis
                yAxisId="cpc"
                orientation="right"
                tick={{ fontSize: 9, fill: "#f59e0b" }}
                stroke="rgba(255,255,255,0.1)"
                domain={[0, cpcMax]}
                tickFormatter={(v: number) => `¥${v}`}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1A1A1A",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  fontSize: 11,
                  color: "#fff",
                }}
                labelFormatter={(l) => String(l)}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => {
                  if (value === null) return [null, null];
                  const v = Number(value);
                  const n = String(name);
                  if (n.includes("広告") || n === "CPC" || n.includes("検索") || n.includes("その他"))
                    return [`¥${v.toLocaleString()}`, n];
                  return [v.toLocaleString(), n];
                }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              {/* キャンペーン別積み上げ棒グラフ */}
              {visibleCampaigns.map((name, i) => (
                <Bar
                  key={name}
                  yAxisId="cost"
                  dataKey={`cost_${name}`}
                  name={shortenName(name)}
                  stackId="cost"
                  fill={CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length]}
                  opacity={0.8}
                  radius={i === visibleCampaigns.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
              <Line yAxisId="cost" dataKey="clicks" name="クリック" stroke="#10b981" strokeWidth={1.5} dot={false} />
              <Line yAxisId="cpc" dataKey="cpc" name="CPC" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Line yAxisId="cost" dataKey="cv_display" name="CV" stroke="#ef4444" strokeWidth={0} dot={{ r: 4, fill: "#ef4444" }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-card">
              <tr className="border-b border-white/10 text-gray-500">
                <th className="text-left py-1.5 px-2">日付</th>
                <th className="text-right py-1.5 px-2">広告費</th>
                <th className="text-right py-1.5 px-2">クリック</th>
                <th className="text-right py-1.5 px-2">CPC</th>
                <th className="text-right py-1.5 px-2">CV</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].reverse().map((d) => (
                <tr key={d.date} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="py-1 px-2 text-gray-400">{d.date}</td>
                  <td className="py-1 px-2 text-right text-white">¥{d.cost.toLocaleString()}</td>
                  <td className="py-1 px-2 text-right text-white">{d.clicks}</td>
                  <td className="py-1 px-2 text-right text-white">¥{d.cpc.toLocaleString()}</td>
                  <td className="py-1 px-2 text-right font-medium" style={{ color: d.conversions > 0 ? "#ef4444" : "#6b7280" }}>
                    {d.conversions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
