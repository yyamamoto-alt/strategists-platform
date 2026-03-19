"use client";

import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import type {
  FunnelMetrics,
  RevenueMetrics,
  ThreeTierRevenue,
} from "@strategy-school/shared-db";

interface ChartsClientProps {
  revenueMetrics: RevenueMetrics[];
  threeTierRevenue: ThreeTierRevenue[];
  funnelMetrics: FunnelMetrics[];
  funnelKisotsu?: FunnelMetrics[];
  funnelShinsotsu?: FunnelMetrics[];
}

export function ChartsClient({
  revenueMetrics,
  threeTierRevenue,
  funnelMetrics,
  funnelKisotsu,
  funnelShinsotsu,
}: ChartsClientProps) {
  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">売上推移</h2>
          <RevenueChart data={revenueMetrics} threeTierData={threeTierRevenue} />
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">ファネル推移</h2>
          <FunnelChart
            data={funnelMetrics}
            kisotsuData={funnelKisotsu}
            shinsotsuData={funnelShinsotsu}
          />
        </div>
      </div>
    </div>
  );
}
