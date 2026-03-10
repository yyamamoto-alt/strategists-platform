export const dynamic = "force-dynamic";
export const revalidate = 60;

import { Suspense } from "react";
import { HeaderSection } from "./sections/header-section";
import { ChartsSection } from "./sections/charts-section";
import { CostSection } from "./sections/cost-section";
import { ChannelSection } from "./sections/channel-section";
import { InsightsSection } from "./sections/insights-section";
import {
  HeaderSkeleton,
  ChartsSkeleton,
  CostSkeleton,
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
      <Suspense fallback={<CostSkeleton />}>
        <CostSection />
      </Suspense>
      <Suspense fallback={<ChannelSkeleton />}>
        <ChannelSection />
      </Suspense>
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsSection />
      </Suspense>
    </div>
  );
}
