"use client";

import { formatCurrency, formatPercent } from "@/lib/utils";
import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { ChannelTable } from "@/components/dashboard/channel-table";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RecentCustomers } from "@/components/dashboard/recent-customers";
import type {
  CustomerWithRelations,
  FunnelMetrics,
  RevenueMetrics,
  ChannelMetrics,
} from "@strategy-school/shared-db";

interface DashboardClientProps {
  totalCustomers: number;
  closedCount: number;
  activeDeals: number;
  customers: CustomerWithRelations[];
  funnelMetrics: FunnelMetrics[];
  revenueMetrics: RevenueMetrics[];
  channelMetrics: ChannelMetrics[];
}

export function DashboardClient({
  totalCustomers,
  closedCount,
  activeDeals,
  customers,
  funnelMetrics,
  revenueMetrics,
  channelMetrics,
}: DashboardClientProps) {
  const latestFunnel = funnelMetrics[funnelMetrics.length - 1];
  const latestRevenue = revenueMetrics[revenueMetrics.length - 1];

  // ファネル・売上データがまだない場合のデフォルト
  const safeFunnel: FunnelMetrics = latestFunnel || {
    period: "-",
    applications: 0,
    scheduled: 0,
    conducted: 0,
    closed: 0,
    scheduling_rate: 0,
    conduct_rate: 0,
    closing_rate: 0,
  };
  const safeRevenue: RevenueMetrics = latestRevenue || {
    period: "-",
    confirmed_revenue: 0,
    projected_revenue: 0,
    school_revenue: 0,
    agent_revenue: 0,
    content_revenue: 0,
    other_revenue: 0,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">
            営業・売上・KPIの概況
          </p>
        </div>
        <div className="text-sm text-gray-500">
          最終更新: {new Date().toLocaleDateString("ja-JP")}
        </div>
      </div>

      <KpiCards
        totalCustomers={totalCustomers}
        closedCount={closedCount}
        activeDeals={activeDeals}
        latestRevenue={safeRevenue}
        latestFunnel={safeFunnel}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">売上推移</h2>
          <RevenueChart data={revenueMetrics} />
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">ファネル推移</h2>
          <FunnelChart data={funnelMetrics} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">チャネル別実績</h2>
          <ChannelTable data={channelMetrics} />
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">最近の顧客</h2>
          <RecentCustomers customers={customers.slice(0, 5)} />
        </div>
      </div>
    </div>
  );
}
