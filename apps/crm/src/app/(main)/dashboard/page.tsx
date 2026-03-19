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
import { InsightsSection } from "./sections/insights-section";
import { DashboardGridWrapper } from "./grid-wrapper";
import {
  HeaderSkeleton,
  ChartsSkeleton,
  AdsSummarySkeleton,
  MetaAdsSkeleton,
  ReceivableSkeleton,
  ChannelSkeleton,
  InsightsSkeleton,
} from "./skeletons";

const ChartSkeleton = () => <div className="bg-surface-card rounded-xl border border-white/10 p-4 h-full animate-pulse" />;

export default async function DashboardPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<HeaderSkeleton />}>
        <HeaderSection />
      </Suspense>

      <DashboardGridWrapper>
        {{
          charts: <Suspense fallback={<ChartsSkeleton />}><ChartsSection /></Suspense>,
          ads: <Suspense fallback={<AdsSummarySkeleton />}><AdsSection /></Suspense>,
          metaAds: <Suspense fallback={<MetaAdsSkeleton />}><MetaAdsSection /></Suspense>,
          chKisotsuApp: <Suspense fallback={<ChartSkeleton />}><ChannelKisotsuApp /></Suspense>,
          chKisotsuClosed: <Suspense fallback={<ChartSkeleton />}><ChannelKisotsuClosed /></Suspense>,
          chShinsotsuApp: <Suspense fallback={<ChartSkeleton />}><ChannelShinsotsuApp /></Suspense>,
          chShinsotsuClosed: <Suspense fallback={<ChartSkeleton />}><ChannelShinsotsuClosed /></Suspense>,
          chTrends: <Suspense fallback={<ChartSkeleton />}><ChannelTrends /></Suspense>,
          salesRate: <Suspense fallback={<ChartSkeleton />}><SalesRateSection /></Suspense>,
          insights: <Suspense fallback={<InsightsSkeleton />}><InsightsSection /></Suspense>,
          receivable: <Suspense fallback={<ReceivableSkeleton />}><ReceivableSection /></Suspense>,
        }}
      </DashboardGridWrapper>
    </div>
  );
}
