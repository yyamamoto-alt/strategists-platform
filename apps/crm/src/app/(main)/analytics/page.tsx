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
  fetchMetaCampaignDaily,
  fetchMetaFunnelData,
  fetchYouTubeVideos,
  fetchYouTubeDaily,
  fetchYouTubeChannelDaily,
  fetchYouTubeFunnelData,
} from "@/lib/data/analytics";
import { AnalyticsClient } from "./analytics-client";

export default async function AnalyticsPage() {
  const [
    pageDailyRows, traffic, searchQueries, searchDailyRows, hourlyRows,
    adsCampaigns, adsKeywords, adsFunnel, metaCampaigns, metaFunnel,
    youtubeVideos, youtubeDaily, youtubeChannelDaily, youtubeFunnel,
  ] = await Promise.all([
    fetchPageDailyRows(90),
    fetchTrafficSources(90),
    fetchSearchQueries(),
    fetchSearchDailyRows(90),
    fetchHourlyData(90),
    fetchAdsCampaignDaily(365),
    fetchAdsKeywordDaily(365),
    fetchAdsFunnelData(),
    fetchMetaCampaignDaily(365),
    fetchMetaFunnelData(),
    fetchYouTubeVideos(),
    fetchYouTubeDaily(90),
    fetchYouTubeChannelDaily(90),
    fetchYouTubeFunnelData(),
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
      metaCampaigns={metaCampaigns}
      metaFunnel={metaFunnel}
      youtubeVideos={youtubeVideos}
      youtubeDaily={youtubeDaily}
      youtubeChannelDaily={youtubeChannelDaily}
      youtubeFunnel={youtubeFunnel}
    />
  );
}
