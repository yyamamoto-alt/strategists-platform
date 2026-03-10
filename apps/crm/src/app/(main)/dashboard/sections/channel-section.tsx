import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { computeChannelTrends } from "@/lib/data/dashboard-metrics";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import { ChannelClient } from "./channel-client";

export async function ChannelSection() {
  const [customers, attributionMap] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchChannelAttributions(),
  ]);

  const attrRecord: Record<string, (typeof attributionMap)[number]> = {};
  for (const a of attributionMap) {
    attrRecord[a.customer_id] = a;
  }

  const channelTrends = computeChannelTrends(customers, attrRecord);

  if (!channelTrends || channelTrends.length === 0) {
    return null;
  }

  return <ChannelClient channelTrends={channelTrends} />;
}
