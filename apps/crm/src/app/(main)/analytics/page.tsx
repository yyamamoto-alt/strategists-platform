export const dynamic = "force-dynamic";

import {
  fetchPageDailyRows,
  fetchTrafficSources,
  fetchSearchQueries,
  fetchSearchDailyRows,
  fetchHourlyData,
  fetchAdsCampaignDaily,
  fetchAdsKeywordDaily,
  fetchAdsFunnelData,
} from "@/lib/data/analytics";
import { AnalyticsClient } from "./analytics-client";

export default async function AnalyticsPage() {
  const [pageDailyRows, traffic, searchQueries, searchDailyRows, hourlyRows, adsCampaigns, adsKeywords, adsFunnel] =
    await Promise.all([
      fetchPageDailyRows(90),
      fetchTrafficSources(90),
      fetchSearchQueries(),
      fetchSearchDailyRows(90),
      fetchHourlyData(90),
      fetchAdsCampaignDaily(90),
      fetchAdsKeywordDaily(90),
      fetchAdsFunnelData(),
    ]);

  return (
    <AnalyticsClient
      pageDailyRows={pageDailyRows}
      traffic={traffic}
      searchQueries={searchQueries}
      searchDailyRows={searchDailyRows}
      hourlyRows={hourlyRows}
      adsCampaigns={adsCampaigns}
      adsKeywords={adsKeywords}
      adsFunnel={adsFunnel}
    />
  );
}
