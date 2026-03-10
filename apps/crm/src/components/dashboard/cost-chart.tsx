"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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

const LOCALSTORAGE_KEY = "crm-cost-chart-cache";

const formatYen = (value: number) => {
  if (value === 0) return "0";
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(0)}万`;
  return value.toLocaleString();
};

/** localStorageからキャッシュ読み込み */
function loadCachedData(): PLData[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

/** localStorageにキャッシュ保存 */
function saveCachedData(data: PLData[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {}
}

function buildApiUrl() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const fy = m >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `/api/freee/pl?startYear=${fy - 1}&endYear=${fy}`;
}

export function CostChart() {
  const [plData, setPlData] = useState<PLData[] | null>(() => loadCachedData());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback((isRefresh: boolean) => {
    const url = buildApiUrl();
    if (isRefresh) setRefreshing(true);

    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const debugInfo = body._debug ? ` [token=${body._debug.tokenLen}chars, expires=${body._debug.expiresAt}, err=${body._debug.rawError?.substring(0, 80)}]` : "";
          throw new Error((body.error || "freee未連携またはデータ取得失敗") + debugInfo);
        }
        return r.json();
      })
      .then((d) => {
        if (Array.isArray(d) && d.length > 0) {
          setPlData(d);
          saveCachedData(d);
          setError(null);
        } else if (d.error) {
          throw new Error(d.error);
        }
      })
      .catch((e) => {
        // キャッシュがあればエラーを表示しない
        if (!plData) setError(e.message);
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [plData]);

  useEffect(() => {
    // キャッシュがあれば即表示、なければローディング
    if (plData) setLoading(false);
    // バックグラウンドで最新データを取得
    fetchData(!!plData);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (loading && !plData) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-500 text-sm">
        freeeデータ読み込み中...
      </div>
    );
  }

  if (error && !plData) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <div className="px-4 py-2 bg-red-900/20 border border-red-800/30 rounded-lg text-sm text-red-400 text-center">
          <p>{error}</p>
          {error.includes("再連携") && (
            <a href="/settings" className="mt-2 inline-block text-xs text-blue-400 underline hover:text-blue-300">
              設定画面へ →
            </a>
          )}
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
      {/* 更新中インジケータ */}
      {refreshing && (
        <div className="text-[10px] text-gray-500 mb-1 text-right">
          最新データ取得中...
        </div>
      )}

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
