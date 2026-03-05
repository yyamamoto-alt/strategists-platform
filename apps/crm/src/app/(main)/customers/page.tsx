export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import { CustomersClient } from "./customers-client";
import { mockCustomers } from "@/lib/mock-data";
import type { ChannelAttribution } from "@/lib/data/marketing-settings";

export const revalidate = 60;

export default async function CustomersPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <CustomersClient customers={mockCustomers} attributionMap={{}} />;
  }

  const [customers, attributions] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchChannelAttributions(),
  ]);

  const attributionMap: Record<string, ChannelAttribution> = {};
  for (const a of attributions) {
    attributionMap[a.customer_id] = a;
  }

  return <CustomersClient customers={customers} attributionMap={attributionMap} />;
}
