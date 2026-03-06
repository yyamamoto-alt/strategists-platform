export const dynamic = "force-dynamic";

import {
  fetchBlogArticles,
  fetchTrafficSources,
  fetchSearchQueries,
  fetchSummaryKPI,
} from "@/lib/data/analytics";
import { AnalyticsClient } from "./analytics-client";

export default async function AnalyticsPage() {
  const [summary, blogArticles, trafficMain, trafficLp3, searchBlog, searchLp] =
    await Promise.all([
      fetchSummaryKPI(),
      fetchBlogArticles(),
      fetchTrafficSources("/"),
      fetchTrafficSources("/lp3/"),
      fetchSearchQueries("/blog/"),
      fetchSearchQueries("/"),
    ]);

  return (
    <AnalyticsClient
      summary={summary}
      blogArticles={blogArticles}
      trafficMain={trafficMain}
      trafficLp3={trafficLp3}
      searchBlog={searchBlog}
      searchLp={searchLp}
    />
  );
}
