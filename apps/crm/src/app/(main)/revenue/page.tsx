import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetrics,
  computeRevenueMetrics,
  computeChannelMetrics,
} from "@/lib/data/dashboard-metrics";
import { RevenueClient } from "./revenue-client";

export const dynamic = "force-dynamic";
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

  return (
    <RevenueClient
      customers={customers}
      revenueMetrics={revenueMetrics}
      funnelMetrics={funnelMetrics}
      channelMetrics={channelMetrics}
    />
  );
}
