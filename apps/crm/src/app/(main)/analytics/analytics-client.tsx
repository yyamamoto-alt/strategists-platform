"use client";

import { useState } from "react";
import type { AnalyticsProps, MainTab } from "@/components/analytics/shared";
import { TabButton } from "@/components/analytics/shared";
import { SeoTab } from "@/components/analytics/SeoTab";
import { LpTab } from "@/components/analytics/LpTab";
import { AdsTab } from "@/components/analytics/AdsTab";
import { MetaAdsTab } from "@/components/analytics/MetaAdsTab";
import { YouTubeTab } from "./youtube-tab";

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
  metaFunnel,
  youtubeVideos,
  youtubeDaily,
  youtubeChannelDaily,
  youtubeFunnel,
}: AnalyticsProps) {
  const [mainTab, setMainTab] = useState<MainTab>("seo");

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">マーケティング分析</h1>
        <p className="text-sm text-gray-500 mt-1">GA4 + Search Console + Google Ads + Meta Ads + YouTube</p>
      </div>

      <div className="flex gap-1 border-b border-white/10">
        <TabButton label="SEO分析" active={mainTab === "seo"} onClick={() => setMainTab("seo")} />
        <TabButton label="LP分析" active={mainTab === "lp"} onClick={() => setMainTab("lp")} />
        <TabButton label="Google広告分析" active={mainTab === "ads"} onClick={() => setMainTab("ads")} />
        <TabButton label="Meta広告" active={mainTab === "meta_ads"} onClick={() => setMainTab("meta_ads")} />
        <TabButton label="YouTube分析" active={mainTab === "youtube"} onClick={() => setMainTab("youtube")} />
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
        <LpTab traffic={traffic} />
      )}

      {mainTab === "ads" && (
        <AdsTab adsCampaigns={adsCampaigns} adsKeywords={adsKeywords} adsFunnel={adsFunnel} />
      )}

      {mainTab === "meta_ads" && (
        <MetaAdsTab metaCampaigns={metaCampaigns} metaFunnel={metaFunnel} />
      )}

      {mainTab === "youtube" && (
        <YouTubeTab
          youtubeVideos={youtubeVideos}
          youtubeDaily={youtubeDaily}
          youtubeChannelDaily={youtubeChannelDaily}
          youtubeFunnel={youtubeFunnel}
        />
      )}
    </div>
  );
}
