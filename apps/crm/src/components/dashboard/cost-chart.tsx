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
} from "recharts";

interface CostData {
  period: string;
  cost_of_sales: number;
  sga: number;
}

const LOCALSTORAGE_KEY = "crm-cost-chart-cache";

const formatYen = (value: number) => {
  if (value === 0) return "0";
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(0)}万`;
  return value.toLocaleString();
};

function loadCachedData(): CostData[] | null {
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

function saveCachedData(data: CostData[]) {
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
  const [costData, setCostData] = useState<CostData[] | null>(() => loadCachedData());
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
          throw new Error(body.error || "freee未連携またはデータ取得失敗");
        }
        return r.json();
      })
      .then((d) => {
        if (Array.isArray(d) && d.length > 0) {
          // コストのみ抽出（売上・利益はfreeeから取らない）
          const mapped: CostData[] = d.map((item: { period: string; cost_of_sales: number; sga: number }) => ({
            period: item.period,
            cost_of_sales: item.cost_of_sales,
            sga: item.sga,
          }));
          setCostData(mapped);
          saveCachedData(mapped);
          setError(null);
        } else if (d.error) {
          throw new Error(d.error);
        }
      })
      .catch((e) => {
        if (!costData) setError(e.message);
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [costData]);

  useEffect(() => {
    if (costData) setLoading(false);
    fetchData(!!costData);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = useMemo(() => {
    if (!costData) return [];
    return costData.map((d) => ({
      period: d.period,
      cost_of_sales: d.cost_of_sales,
      sga: d.sga,
      total_cost: d.cost_of_sales + d.sga,
    }));
  }, [costData]);

  const yMax = useMemo(() => {
    if (chartData.length === 0) return 5000000;
    let max = 0;
    for (const d of chartData) {
      const total = d.cost_of_sales + d.sga;
      if (total > max) max = total;
    }
    const step = 1000000;
    return Math.ceil(max * 1.1 / step) * step || 5000000;
  }, [chartData]);

  if (loading && !costData) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-500 text-sm">
        freeeデータ読み込み中...
      </div>
    );
  }

  if (error && !costData) {
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
      {refreshing && (
        <div className="text-[10px] text-gray-500 mb-1 text-right">
          最新データ取得中...
        </div>
      )}

      <ResponsiveContainer width="100%" height={300}>
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
            domain={[0, yMax]}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              `¥${value.toLocaleString()}`,
              name === "total_cost" ? "総コスト" : name,
            ]}
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
