export const dynamic = "force-dynamic";
export const revalidate = 60;

import { Suspense } from "react";
import { DashboardClient } from "./dashboard-client";
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

// モックデータ（フォールバック用）
import {
  mockFunnelMetrics,
  mockRevenueMetrics,
  mockCustomers,
} from "@/lib/mock-data";

export default async function DashboardPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    const totalCustomers = mockCustomers.length;
    const closedCount = mockCustomers.filter(
      (c) => c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済"
    ).length;

    return (
      <DashboardClient
        totalCustomers={totalCustomers}
        closedCount={closedCount}
        funnelMetrics={mockFunnelMetrics}
        revenueMetrics={mockRevenueMetrics}
      />
    );
  }

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
