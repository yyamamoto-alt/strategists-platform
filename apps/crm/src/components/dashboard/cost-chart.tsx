"use client";

import { useState, useEffect, useMemo } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
} from "recharts";

interface PLData {
  period: string;
  revenue: number;
  cost_of_sales: number;
  sga: number;
}

const formatYen = (value: number) => {
  if (value === 0) return "0";
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(0)}万`;
  return value.toLocaleString();
};

export function CostChart() {
  const [plData, setPlData] = useState<PLData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentFiscalYear = currentMonth >= 4 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;

    fetch(`/api/freee/pl?startYear=${currentFiscalYear - 1}&endYear=${currentFiscalYear}`)
      .then((r) => {
        if (!r.ok) throw new Error("freee未連携またはデータ取得失敗");
        return r.json();
      })
      .then((d) => {
        if (Array.isArray(d)) setPlData(d);
        else throw new Error(d.error || "不明なエラー");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    if (!plData) return [];
    return plData.map((d) => ({
      period: d.period,
      revenue: d.revenue,
      cost_of_sales: d.cost_of_sales,
      sga: d.sga,
      total_cost: d.cost_of_sales + d.sga,
      profit: d.revenue - d.cost_of_sales - d.sga,
    }));
  }, [plData]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 5000000 };
    let max = 0;
    let min = 0;
    for (const d of chartData) {
      const barTotal = d.cost_of_sales + d.sga;
      if (barTotal > max) max = barTotal;
      if (d.profit < min) min = d.profit;
    }
    const step = 1000000;
    return {
      min: Math.floor(min / step) * step,
      max: Math.ceil(max * 1.1 / step) * step || 5000000,
    };
  }, [chartData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-500 text-sm">
        freeeデータ読み込み中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <div className="px-4 py-2 bg-red-900/20 border border-red-800/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-[200px] text-gray-500 text-sm">
        コストデータがありません
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            stroke="rgba(255,255,255,0.1)"
            angle={-45}
            textAnchor="end"
            height={45}
            interval={0}
            tickFormatter={(v: string) => {
              const [y, m] = v.split("/");
              return m === "04" ? `${y}/${m}` : m;
            }}
          />
          <YAxis
            tickFormatter={formatYen}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            stroke="rgba(255,255,255,0.1)"
            domain={[yDomain.min, yDomain.max]}
          />
          <Tooltip
            formatter={(value, name) => [`¥${Number(value).toLocaleString()}`, name]}
            contentStyle={{
              backgroundColor: "#1A1A1A",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#fff",
            }}
            labelStyle={{ color: "#9ca3af" }}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />

          {/* コスト積み上げ棒グラフ */}
          <Bar
            dataKey="cost_of_sales"
            name="売上原価"
            fill="#f87171"
            stackId="cost"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="sga"
            name="販管費"
            fill="#ef4444"
            fillOpacity={0.6}
            stackId="cost"
            radius={[2, 2, 0, 0]}
          />

          {/* 営業利益ライン */}
          <Line
            type="monotone"
            dataKey="profit"
            name="営業利益"
            stroke="#22c55e"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#22c55e", stroke: "#fff", strokeWidth: 1.5 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* サマリーテーブル */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-1.5 px-2 text-gray-500 font-medium">月</th>
              <th className="text-right py-1.5 px-2 text-gray-500 font-medium">売上高</th>
              <th className="text-right py-1.5 px-2 text-gray-500 font-medium">売上原価</th>
              <th className="text-right py-1.5 px-2 text-gray-500 font-medium">販管費</th>
              <th className="text-right py-1.5 px-2 text-gray-500 font-medium">総コスト</th>
              <th className="text-right py-1.5 px-2 text-gray-500 font-medium">営業利益</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d) => (
              <tr key={d.period} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                <td className="py-1 px-2 text-gray-400">{d.period}</td>
                <td className="py-1 px-2 text-right text-gray-300">¥{d.revenue.toLocaleString()}</td>
                <td className="py-1 px-2 text-right text-red-400">¥{d.cost_of_sales.toLocaleString()}</td>
                <td className="py-1 px-2 text-right text-red-300">¥{d.sga.toLocaleString()}</td>
                <td className="py-1 px-2 text-right text-red-400 font-medium">¥{d.total_cost.toLocaleString()}</td>
                <td className={`py-1 px-2 text-right font-medium ${d.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                  ¥{d.profit.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
