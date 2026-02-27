"use client";

import { mockFunnelMetrics, mockRevenueMetrics, mockChannelMetrics, mockCustomers } from "@/lib/mock-data";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { ChannelTable } from "@/components/dashboard/channel-table";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RecentCustomers } from "@/components/dashboard/recent-customers";

export default function DashboardPage() {
  const latestFunnel = mockFunnelMetrics[mockFunnelMetrics.length - 1];
  const latestRevenue = mockRevenueMetrics[mockRevenueMetrics.length - 1];

  // パイプライン集計
  const pipelineCounts = mockCustomers.reduce(
    (acc, c) => {
      if (c.pipeline) {
        acc[c.pipeline.stage] = (acc[c.pipeline.stage] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const totalCustomers = mockCustomers.length;
  const closedCount = mockCustomers.filter(
    (c) => c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済"
  ).length;
  const activeDeals = mockCustomers.filter(
    (c) =>
      c.pipeline?.stage !== "失注" &&
      c.pipeline?.stage !== "入金済" &&
      c.pipeline?.stage !== "成約"
  ).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">
            営業・売上・KPIの概況
          </p>
        </div>
        <div className="text-sm text-gray-500">
          最終更新: {new Date().toLocaleDateString("ja-JP")}
        </div>
      </div>

      {/* KPIカード */}
      <KpiCards
        totalCustomers={totalCustomers}
        closedCount={closedCount}
        activeDeals={activeDeals}
        latestRevenue={latestRevenue}
        latestFunnel={latestFunnel}
      />

      {/* チャート */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">売上推移</h2>
          <RevenueChart data={mockRevenueMetrics} />
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">ファネル推移</h2>
          <FunnelChart data={mockFunnelMetrics} />
        </div>
      </div>

      {/* 下段 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">チャネル別実績</h2>
          <ChannelTable data={mockChannelMetrics} />
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">最近の顧客</h2>
          <RecentCustomers customers={mockCustomers.slice(0, 5)} />
        </div>
      </div>
    </div>
  );
}
