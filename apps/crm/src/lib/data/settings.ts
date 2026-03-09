import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import type { LtvConfig } from "@/lib/calc-fields";
import { DEFAULT_LTV_CONFIG } from "@/lib/calc-fields";

/** app_settings からLTV設定を取得 */
async function fetchLtvConfigRaw(): Promise<LtvConfig> {
  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    const { data } = await db
      .from("app_settings")
      .select("key, value")
      .in("key", ["default_ltv_kisotsu", "default_ltv_shinsotsu"]);

    if (!data || data.length === 0) return DEFAULT_LTV_CONFIG;

    const config = { ...DEFAULT_LTV_CONFIG };
    for (const row of data) {
      const val = typeof row.value === "number" ? row.value : Number(row.value);
      if (isNaN(val) || val <= 0) continue;
      if (row.key === "default_ltv_kisotsu") config.defaultLtvKisotsu = val;
      if (row.key === "default_ltv_shinsotsu") config.defaultLtvShinsotsu = val;
    }
    return config;
  } catch {
    return DEFAULT_LTV_CONFIG;
  }
}

export const fetchLtvConfig = unstable_cache(
  fetchLtvConfigRaw,
  ["ltv-config"],
  { revalidate: 300, tags: ["settings"] }
);
