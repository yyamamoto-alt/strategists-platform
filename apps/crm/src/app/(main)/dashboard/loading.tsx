import {
  HeaderSkeleton,
  ChartsSkeleton,
  CostSkeleton,
  ChannelSkeleton,
  InsightsSkeleton,
} from "./skeletons";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <ChartsSkeleton />
      <CostSkeleton />
      <ChannelSkeleton />
      <InsightsSkeleton />
    </div>
  );
}
