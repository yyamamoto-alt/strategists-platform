export const dynamic = "force-dynamic";
export const revalidate = 60;

import { Suspense } from "react";
import { HeaderSection } from "./sections/header-section";
import { ChartsSection } from "./sections/charts-section";
import { AdsSection } from "./sections/ads-section";
import { MetaAdsSection } from "./sections/meta-ads-section";
import { ReceivableSection } from "./sections/receivable-section";
import { ChannelSection } from "./sections/channel-section";
import { InsightsSection } from "./sections/insights-section";
import {
  HeaderSkeleton,
  ChartsSkeleton,
  AdsSummarySkeleton,
  MetaAdsSkeleton,
  ReceivableSkeleton,
  ChannelSkeleton,
  InsightsSkeleton,
} from "./skeletons";

export default async function DashboardPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<HeaderSkeleton />}>
        <HeaderSection />
      </Suspense>
      <Suspense fallback={<ChartsSkeleton />}>
        <ChartsSection />
      </Suspense>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-6">
        <Suspense fallback={<AdsSummarySkeleton />}>
          <AdsSection />
        </Suspense>
        <Suspense fallback={<MetaAdsSkeleton />}>
          <MetaAdsSection />
        </Suspense>
      </div>
      <div className="px-6">
        <Suspense fallback={<ChannelSkeleton />}>
          <ChannelSection />
        </Suspense>
      </div>
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsSection />
      </Suspense>
      <Suspense fallback={<ReceivableSkeleton />}>
        <ReceivableSection />
      </Suspense>
    </div>
  );
}
