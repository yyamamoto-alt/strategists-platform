import { fetchLatestInsights } from "@/lib/data/insights";
import { InsightsClient } from "./insights-client";

export async function InsightsSection() {
  const insights = await fetchLatestInsights();
  return <InsightsClient insights={insights} />;
}
