import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetrics,
  computeRevenueMetrics,
  computeChannelMetrics,
  computeThreeTierRevenue,
  computeAgentRevenueSummary,
  computeQuarterlyForecast,
  computeChannelFunnelPivot,
} from "@/lib/data/dashboard-metrics";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
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

  const [customers, attributions] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchChannelAttributions(),
  ]);

  // 帰属データをMapに変換
  const attributionMap: Record<string, (typeof attributions)[number]> = {};
  for (const attr of attributions) {
    attributionMap[attr.customer_id] = attr;
  }

  const revenueMetrics = computeRevenueMetrics(customers);
  const funnelMetrics = computeFunnelMetrics(customers);
  const channelMetrics = computeChannelMetrics(customers, attributionMap);
  const threeTierRevenue = computeThreeTierRevenue(customers);
  const agentSummary = computeAgentRevenueSummary(customers);
  const quarterlyForecast = computeQuarterlyForecast(customers);
  const channelPivot = computeChannelFunnelPivot(customers, attributionMap);

  return (
    <RevenueClient
      customers={customers}
      revenueMetrics={revenueMetrics}
      funnelMetrics={funnelMetrics}
      channelMetrics={channelMetrics}
      threeTierRevenue={threeTierRevenue}
      agentSummary={agentSummary}
      quarterlyForecast={quarterlyForecast}
      channelPivot={channelPivot}
    />
  );
}
