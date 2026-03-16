import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { computeChannelTrends, computeChannelMonthlyRaw } from "@/lib/data/dashboard-metrics";
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
  const monthlyRaw = computeChannelMonthlyRaw(customers, attrRecord);

  if (!channelTrends || channelTrends.length === 0) {
    return null;
  }

  return <ChannelClient channelTrends={channelTrends} monthlyRaw={monthlyRaw} />;
}
