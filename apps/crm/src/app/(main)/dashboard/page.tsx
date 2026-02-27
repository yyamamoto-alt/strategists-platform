import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetrics,
  computeRevenueMetrics,
  computeChannelMetrics,
  fetchDashboardData,
} from "@/lib/data/dashboard-metrics";
import { DashboardClient } from "./dashboard-client";

// モックデータ（フォールバック用）
import {
  mockFunnelMetrics,
  mockRevenueMetrics,
  mockChannelMetrics,
  mockCustomers,
} from "@/lib/mock-data";

export default async function DashboardPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
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
      <DashboardClient
        totalCustomers={totalCustomers}
        closedCount={closedCount}
        activeDeals={activeDeals}
        customers={mockCustomers}
        funnelMetrics={mockFunnelMetrics}
        revenueMetrics={mockRevenueMetrics}
        channelMetrics={mockChannelMetrics}
      />
    );
  }

  // 実データモード
  const [customers, dashboardData] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchDashboardData(),
  ]);

  const funnelMetrics = computeFunnelMetrics(customers);
  const revenueMetrics = computeRevenueMetrics(customers);
  const channelMetrics = computeChannelMetrics(customers);

  return (
    <DashboardClient
      totalCustomers={dashboardData.totalCustomers}
      closedCount={dashboardData.closedCount}
      activeDeals={dashboardData.activeDeals}
      customers={customers}
      funnelMetrics={funnelMetrics}
      revenueMetrics={revenueMetrics}
      channelMetrics={channelMetrics}
    />
  );
}
