export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import { MarketingClient } from "./marketing-client";
import type { ChannelAttribution } from "@/lib/data/marketing-settings";

export const revalidate = 60;

export default async function MarketingPage() {
  const [customers, attributions] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchChannelAttributions(),
  ]);

  // customer_id → ChannelAttribution のマップを構築
  const attributionMap: Record<string, ChannelAttribution> = {};
  for (const a of attributions) {
    attributionMap[a.customer_id] = a;
  }

  return <MarketingClient customers={customers} attributionMap={attributionMap} />;
}
