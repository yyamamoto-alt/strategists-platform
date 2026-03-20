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
  fetchMetaAdsetDaily,
  fetchMetaAdDaily,
  fetchMetaFunnelData,
  fetchYouTubeVideos,
  fetchYouTubeDaily,
  fetchYouTubeChannelDaily,
  fetchYouTubeFunnelData,
  fetchYouTubeTrafficSources,
  fetchYouTubeSearchTerms,
} from "@/lib/data/analytics";
import { AnalyticsClient } from "./analytics-client";
import { AdsSection } from "../dashboard/sections/ads-section";
import { MetaAdsSection } from "../dashboard/sections/meta-ads-section";
import { createServiceClient } from "@/lib/supabase/server";

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
    fetchMetaAdsetDaily(365),
    fetchMetaAdDaily(365),
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
  const metaAdsets = v(results[16], []);
  const metaAds = v(results[17], []);

  // 各データソースの最新日付を取得
  const latestDate = (rows: { date: string }[]) =>
    rows.length > 0 ? rows.reduce((max, r) => r.date > max ? r.date : max, rows[0].date) : null;

  const lastUpdated = {
    ga: latestDate(pageDailyRows),
    ads: latestDate(adsCampaigns),
    meta: latestDate(metaCampaigns),
    youtube: latestDate(youtubeChannelDaily),
  };

  // 広告週次レポート（KPTテーブル用）
  const supabase = createServiceClient();
  const { data: adsWeeklyReports } = await (supabase as any)
    .from("ads_weekly_reports")
    .select("*")
    .order("week_start", { ascending: false });

  return (
    <>
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
        metaAdsets={metaAdsets}
        metaAds={metaAds}
        metaFunnel={metaFunnel}
        youtubeVideos={youtubeVideos}
        youtubeDaily={youtubeDaily}
        youtubeChannelDaily={youtubeChannelDaily}
        youtubeFunnel={youtubeFunnel}
        youtubeTrafficSources={youtubeTrafficSources}
        youtubeSearchTerms={youtubeSearchTerms}
        lastUpdated={lastUpdated}
        adsSummary={<AdsSection />}
        metaAdsSummary={<MetaAdsSection />}
        adsWeeklyReports={adsWeeklyReports ?? []}
      />
    </>
  );
}
