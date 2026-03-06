export const dynamic = "force-dynamic";

import {
  fetchPageDailyRows,
  fetchTrafficSources,
  fetchSearchQueries,
} from "@/lib/data/analytics";
import { AnalyticsClient } from "./analytics-client";

export default async function AnalyticsPage() {
  const [pageDailyRows, traffic, searchQueries] = await Promise.all([
    fetchPageDailyRows(90),
    fetchTrafficSources(90),
    fetchSearchQueries(),
  ]);

  return (
    <AnalyticsClient
      pageDailyRows={pageDailyRows}
      traffic={traffic}
      searchQueries={searchQueries}
    />
  );
}
