export const dynamic = "force-dynamic";

import {
  fetchAllPages,
  fetchTrafficSources,
  fetchSearchByPage,
} from "@/lib/data/analytics";
import { AnalyticsClient } from "./analytics-client";

export default async function AnalyticsPage() {
  const [pages, traffic, searchByPage] = await Promise.all([
    fetchAllPages(90),
    fetchTrafficSources(90),
    fetchSearchByPage(),
  ]);

  return (
    <AnalyticsClient
      aggregatedPages={pages.aggregated}
      dailyTrend={pages.trend}
      traffic={traffic}
      searchByPage={searchByPage}
    />
  );
}
