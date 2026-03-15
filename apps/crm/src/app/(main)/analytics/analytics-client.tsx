"use client";

import { useState } from "react";
import type { AnalyticsProps, MainTab } from "@/components/analytics/shared";
import { TabButton } from "@/components/analytics/shared";
import { SeoTab } from "@/components/analytics/SeoTab";
import { LpTab } from "@/components/analytics/LpTab";
import { AdsTab } from "@/components/analytics/AdsTab";
import { MetaAdsTab } from "@/components/analytics/MetaAdsTab";
import { YouTubeTab } from "./youtube-tab";
import { HeatmapTab } from "@/components/analytics/HeatmapTab";

export function AnalyticsClient({
  pageDailyRows,
  traffic,
  searchQueries,
  searchDailyRows,
  hourlyRows,
  adsCampaigns,
  adsKeywords,
  adsFunnel,
  metaCampaigns,
  metaAdsets,
  metaAds,
  metaFunnel,
  youtubeVideos,
  youtubeDaily,
  youtubeChannelDaily,
  youtubeFunnel,
  youtubeTrafficSources,
  youtubeSearchTerms,
  lastUpdated,
}: AnalyticsProps) {
  const [mainTab, setMainTab] = useState<MainTab>("seo");

  const lu = lastUpdated;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">マーケティング分析</h1>
          <p className="text-sm text-gray-500 mt-1">GA4 + Search Console + Google Ads + Meta Ads + YouTube</p>
        </div>
        {lu && (
          <div className="text-[10px] text-gray-500 text-right space-y-0.5">
            <p className="text-gray-400 font-medium">最新データ取得日</p>
            {lu.ga && <p>GA4: {lu.ga}</p>}
            {lu.ads && <p>Google Ads: {lu.ads}</p>}
            {lu.meta && <p>Meta Ads: {lu.meta}</p>}
            {lu.youtube && <p>YouTube: {lu.youtube}</p>}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-white/10">
        <TabButton label="SEO分析" active={mainTab === "seo"} onClick={() => setMainTab("seo")} />
        <TabButton label="LP分析" active={mainTab === "lp"} onClick={() => setMainTab("lp")} />
        <TabButton label="Google広告分析" active={mainTab === "ads"} onClick={() => setMainTab("ads")} />
        <TabButton label="Meta広告" active={mainTab === "meta_ads"} onClick={() => setMainTab("meta_ads")} />
        <TabButton label="YouTube分析" active={mainTab === "youtube"} onClick={() => setMainTab("youtube")} />
        <TabButton label="ヒートマップ" active={mainTab === "heatmap"} onClick={() => setMainTab("heatmap")} />
      </div>

      {mainTab === "seo" && (
        <SeoTab
          pageDailyRows={pageDailyRows}
          searchQueries={searchQueries}
          searchDailyRows={searchDailyRows}
          hourlyRows={hourlyRows}
        />
      )}

      {mainTab === "lp" && (
        <LpTab traffic={traffic} pageDailyRows={pageDailyRows} />
      )}

      {mainTab === "ads" && (
        <AdsTab adsCampaigns={adsCampaigns} adsKeywords={adsKeywords} adsFunnel={adsFunnel} />
      )}

      {mainTab === "meta_ads" && (
        <MetaAdsTab metaCampaigns={metaCampaigns} metaAdsets={metaAdsets} metaAds={metaAds} metaFunnel={metaFunnel} />
      )}

      {mainTab === "youtube" && (
        <YouTubeTab
          youtubeVideos={youtubeVideos}
          youtubeDaily={youtubeDaily}
          youtubeChannelDaily={youtubeChannelDaily}
          youtubeFunnel={youtubeFunnel}
          youtubeTrafficSources={youtubeTrafficSources}
          youtubeSearchTerms={youtubeSearchTerms}
          searchQueries={searchQueries}
          adsKeywords={adsKeywords}
        />
      )}

      {mainTab === "heatmap" && (
        <HeatmapTab />
      )}
    </div>
  );
}
