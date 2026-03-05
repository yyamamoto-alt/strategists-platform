import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { computePLSheetData } from "@/lib/data/dashboard-metrics";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import { RevenueClient } from "./revenue-client";

export const revalidate = 60;

import { mockCustomers } from "@/lib/mock-data";

export default async function RevenuePage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    const plData = computePLSheetData(mockCustomers, {});
    return <RevenueClient plData={plData} />;
  }

  const [customers, attributions] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchChannelAttributions(),
  ]);

  const attributionMap: Record<string, (typeof attributions)[number]> = {};
  for (const attr of attributions) {
    attributionMap[attr.customer_id] = attr;
  }

  const plData = computePLSheetData(customers, attributionMap);

  return <RevenueClient plData={plData} />;
}
