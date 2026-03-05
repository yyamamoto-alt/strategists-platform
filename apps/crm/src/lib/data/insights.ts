import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import type { AiInsight } from "@strategy-school/shared-db";

async function fetchLatestInsightsRaw(): Promise<AiInsight[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 新カテゴリ: revenue, funnel, channel + 旧カテゴリ: marketing, sales（後方互換）
  const categories = ["revenue", "funnel", "channel", "marketing", "sales"];
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

  // 新カテゴリがあれば新カテゴリのみ返す、なければ旧カテゴリを返す
  const newCategories = results.filter(
    (r) => r.category === "revenue" || r.category === "funnel" || r.category === "channel"
  );
  if (newCategories.length > 0) return newCategories;

  return results.filter(
    (r) => r.category === "marketing" || r.category === "sales"
  );
}

export const fetchLatestInsights = unstable_cache(
  fetchLatestInsightsRaw,
  ["ai-insights-latest"],
  { revalidate: 60 }
);
