import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetricsBySegment,
  computeRevenueMetrics,
  computeThreeTierRevenue,
  computeChannelTrends,
  fetchDashboardData,
} from "@/lib/data/dashboard-metrics";
import { fetchLatestInsights } from "@/lib/data/insights";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import { DashboardClient } from "./dashboard-client";

export const revalidate = 60;

// モックデータ（フォールバック用）
import {
  mockFunnelMetrics,
  mockRevenueMetrics,
  mockCustomers,
} from "@/lib/mock-data";

export default async function DashboardPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    const totalCustomers = mockCustomers.length;
    const closedCount = mockCustomers.filter(
      (c) => c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済"
    ).length;

    return (
      <DashboardClient
        totalCustomers={totalCustomers}
        closedCount={closedCount}
        funnelMetrics={mockFunnelMetrics}
        revenueMetrics={mockRevenueMetrics}
      />
    );
  }

  // 実データモード
  const [customers, dashboardData, insights, attributionMap] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchDashboardData(),
    fetchLatestInsights(),
    fetchChannelAttributions(),
  ]);

  // 配列 → Record<customer_id, attribution> 変換
  const attrRecord: Record<string, (typeof attributionMap)[number]> = {};
  for (const a of attributionMap) {
    attrRecord[a.customer_id] = a;
  }

  const funnelBySegment = computeFunnelMetricsBySegment(customers);
  const revenueMetrics = computeRevenueMetrics(customers);
  const threeTierRevenue = computeThreeTierRevenue(customers);
  const channelTrends = computeChannelTrends(customers, attrRecord);

  return (
    <DashboardClient
      totalCustomers={dashboardData.totalCustomers}
      closedCount={dashboardData.closedCount}
      funnelMetrics={funnelBySegment.all}
      funnelKisotsu={funnelBySegment.kisotsu}
      funnelShinsotsu={funnelBySegment.shinsotsu}
      revenueMetrics={revenueMetrics}
      threeTierRevenue={threeTierRevenue}
      insights={insights}
      channelTrends={channelTrends}
    />
  );
}
