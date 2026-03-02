import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import type { AiInsight } from "@strategy-school/shared-db";

async function fetchLatestInsightsRaw(): Promise<AiInsight[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 各カテゴリの最新1件を取得
  const categories = ["marketing", "management", "sales"];
  const results: AiInsight[] = [];

  for (const category of categories) {
    const { data, error } = await db
      .from("ai_insights")
      .select("*")
      .eq("category", category)
      .order("generated_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error(`Failed to fetch ai_insights for ${category}:`, error);
      continue;
    }

    if (data && data.length > 0) {
      results.push(data[0] as AiInsight);
    }
  }

  return results;
}

export const fetchLatestInsights = unstable_cache(
  fetchLatestInsightsRaw,
  ["ai-insights-latest"],
  { revalidate: 60 }
);
