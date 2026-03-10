import {
  HeaderSkeleton,
  ChartsSkeleton,
  ChannelSkeleton,
  InsightsSkeleton,
} from "./skeletons";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <ChartsSkeleton />
      <ChannelSkeleton />
      <InsightsSkeleton />
    </div>
  );
}
