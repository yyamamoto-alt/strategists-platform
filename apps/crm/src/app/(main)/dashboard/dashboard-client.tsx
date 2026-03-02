"use client";

import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import type {
  FunnelMetrics,
  RevenueMetrics,
  ThreeTierRevenue,
} from "@strategy-school/shared-db";

interface DashboardClientProps {
  totalCustomers: number;
  closedCount: number;
  funnelMetrics: FunnelMetrics[];
  revenueMetrics: RevenueMetrics[];
  threeTierRevenue?: ThreeTierRevenue[];
}

export function DashboardClient({
  totalCustomers,
  closedCount,
  funnelMetrics,
  revenueMetrics,
  threeTierRevenue,
}: DashboardClientProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCustomers}顧客 / 成約 {closedCount}件
          </p>
        </div>
        <div className="text-sm text-gray-500">
          最終更新: {new Date().toLocaleDateString("ja-JP")}
        </div>
      </div>

      {/* 売上推移 + ファネル推移 横並び */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">売上推移</h2>
          <RevenueChart data={revenueMetrics} threeTierData={threeTierRevenue} />
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">ファネル推移</h2>
          <FunnelChart data={funnelMetrics} />
        </div>
      </div>
    </div>
  );
}
