import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetrics,
  computeRevenueMetrics,
  computeThreeTierRevenue,
  fetchDashboardData,
} from "@/lib/data/dashboard-metrics";
import { fetchLatestInsights } from "@/lib/data/insights";
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
  const [customers, dashboardData, insights] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchDashboardData(),
    fetchLatestInsights(),
  ]);

  const funnelMetrics = computeFunnelMetrics(customers);
  const revenueMetrics = computeRevenueMetrics(customers);
  const threeTierRevenue = computeThreeTierRevenue(customers);

  return (
    <DashboardClient
      totalCustomers={dashboardData.totalCustomers}
      closedCount={dashboardData.closedCount}
      funnelMetrics={funnelMetrics}
      revenueMetrics={revenueMetrics}
      threeTierRevenue={threeTierRevenue}
      insights={insights}
    />
  );
}
