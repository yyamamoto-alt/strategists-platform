export const dynamic = "force-dynamic";
export const revalidate = 60;

import { Suspense } from "react";
import { HeaderSection } from "./sections/header-section";
import { ChartsSection } from "./sections/charts-section";
import { AdsSection } from "./sections/ads-section";
import { MetaAdsSection } from "./sections/meta-ads-section";
import { ReceivableSection } from "./sections/receivable-section";
import {
  ChannelKisotsuApp,
  ChannelKisotsuClosed,
  ChannelShinsotsuApp,
  ChannelShinsotsuClosed,
  ChannelTrends,
} from "./sections/channel-section";
import { SalesRateSection } from "./sections/sales-rate-section";
import { SalesCostSection } from "./sections/sales-cost-section";
import { YouTubeSection } from "./sections/youtube-section";
import {
  HeaderSkeleton,
  ChartsSkeleton,
  AdsSummarySkeleton,
  MetaAdsSkeleton,
  ReceivableSkeleton,
  ChannelSkeleton,
} from "./skeletons";

const CardSkeleton = () => (
  <div className="bg-surface-card rounded-xl border border-white/10 p-4 h-full animate-pulse" />
);

export default async function DashboardPage() {
  return (
    <div className="space-y-6 px-6 py-6">
      <Suspense fallback={<HeaderSkeleton />}>
        <HeaderSection />
      </Suspense>

      {/* 売上推移 + ファネル推移 */}
      <Suspense fallback={<ChartsSkeleton />}>
        <ChartsSection />
      </Suspense>

      {/* 広告パフォーマンス 2列 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<AdsSummarySkeleton />}>
          <AdsSection />
        </Suspense>
        <Suspense fallback={<MetaAdsSkeleton />}>
          <MetaAdsSection />
        </Suspense>
      </div>

      {/* チャネル別状況 2×2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<CardSkeleton />}>
          <ChannelKisotsuApp />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <ChannelKisotsuClosed />
        </Suspense>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<CardSkeleton />}>
          <ChannelShinsotsuApp />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <ChannelShinsotsuClosed />
        </Suspense>
      </div>

      {/* チャネル別申込推移 */}
      <Suspense fallback={<ChannelSkeleton />}>
        <ChannelTrends />
      </Suspense>

      {/* YouTube 視聴推移 + 成約LTV */}
      <Suspense fallback={<CardSkeleton />}>
        <YouTubeSection />
      </Suspense>

      {/* 営業マン別成約率 */}
      <Suspense fallback={<CardSkeleton />}>
        <SalesRateSection />
      </Suspense>

      {/* 営業コスト試算 */}
      <Suspense fallback={<CardSkeleton />}>
        <SalesCostSection />
      </Suspense>

      {/* 売掛金 */}
      <Suspense fallback={<ReceivableSkeleton />}>
        <ReceivableSection />
      </Suspense>
    </div>
  );
}
