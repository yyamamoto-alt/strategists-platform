import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetrics,
  computeRevenueMetrics,
  computeChannelMetrics,
  computeThreeTierRevenue,
  computeAgentRevenueSummary,
  computeQuarterlyForecast,
} from "@/lib/data/dashboard-metrics";
import { RevenueClient } from "./revenue-client";

export const revalidate = 60;
import {
  mockRevenueMetrics,
  mockFunnelMetrics,
  mockChannelMetrics,
  mockCustomers,
} from "@/lib/mock-data";

export default async function RevenuePage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return (
      <RevenueClient
        customers={mockCustomers}
        revenueMetrics={mockRevenueMetrics}
        funnelMetrics={mockFunnelMetrics}
        channelMetrics={mockChannelMetrics}
      />
    );
  }

  const customers = await fetchCustomersWithRelations();
  const revenueMetrics = computeRevenueMetrics(customers);
  const funnelMetrics = computeFunnelMetrics(customers);
  const channelMetrics = computeChannelMetrics(customers);
  const threeTierRevenue = computeThreeTierRevenue(customers);
  const agentSummary = computeAgentRevenueSummary(customers);
  const quarterlyForecast = computeQuarterlyForecast(customers);

  return (
    <RevenueClient
      customers={customers}
      revenueMetrics={revenueMetrics}
      funnelMetrics={funnelMetrics}
      channelMetrics={channelMetrics}
      threeTierRevenue={threeTierRevenue}
      agentSummary={agentSummary}
      quarterlyForecast={quarterlyForecast}
    />
  );
}
