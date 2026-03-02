import { fetchMarketingChannels, fetchMappingRules, fetchChannelAttributions, computeAttributionStats } from "@/lib/data/marketing-settings";
import { MarketingSettingsClient } from "./marketing-settings-client";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function MarketingSettingsPage() {
  const [channels, rules, attributions] = await Promise.all([
    fetchMarketingChannels(),
    fetchMappingRules(),
    fetchChannelAttributions(),
  ]);

  const stats = computeAttributionStats(attributions);

  return (
    <MarketingSettingsClient
      initialChannels={channels}
      initialRules={rules}
      stats={stats}
    />
  );
}
