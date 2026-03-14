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
  fetchYouTubeTrafficSources,
  fetchYouTubeSearchTerms,
} from "@/lib/data/analytics";
import { AnalyticsClient } from "./analytics-client";

export default async function AnalyticsPage() {
  // Use allSettled so one failing fetch doesn't break the entire page
  const results = await Promise.allSettled([
    fetchPageDailyRows(180),
    fetchTrafficSources(180),
    fetchSearchQueries(),
    fetchSearchDailyRows(90),
    fetchHourlyData(90),
    fetchAdsCampaignDaily(365),
    fetchAdsKeywordDaily(365),
    fetchAdsFunnelData(),
    fetchMetaCampaignDaily(365),
    fetchMetaFunnelData(),
    fetchYouTubeVideos(),
    fetchYouTubeDaily(),
    fetchYouTubeChannelDaily(),
    fetchYouTubeFunnelData(),
    fetchYouTubeTrafficSources(),
    fetchYouTubeSearchTerms(),
  ]);

  const v = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === "fulfilled" ? r.value : fallback;

  const pageDailyRows = v(results[0], []);
  const traffic = v(results[1], []);
  const searchQueries = v(results[2], []);
  const searchDailyRows = v(results[3], []);
  const hourlyRows = v(results[4], []);
  const adsCampaigns = v(results[5], []);
  const adsKeywords = v(results[6], []);
  const adsFunnel = v(results[7], []);
  const metaCampaigns = v(results[8], []);
  const metaFunnel = v(results[9], []);
  const youtubeVideos = v(results[10], []);
  const youtubeDaily = v(results[11], []);
  const youtubeChannelDaily = v(results[12], []);
  const youtubeFunnel = v(results[13], []);
  const youtubeTrafficSources = v(results[14], []);
  const youtubeSearchTerms = v(results[15], []);

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
      youtubeTrafficSources={youtubeTrafficSources}
      youtubeSearchTerms={youtubeSearchTerms}
    />
  );
}
