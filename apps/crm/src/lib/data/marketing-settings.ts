import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import type {
  MarketingChannel,
  MappingRule,
} from "@/lib/marketing-attribution";

// ================================================================
// チャネルマスタ取得
// ================================================================

async function fetchMarketingChannelsRaw(): Promise<MarketingChannel[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("marketing_channels")
    .select("*")
    .order("priority", { ascending: true });

  if (error) {
    console.error("Failed to fetch marketing_channels:", error);
    return [];
  }

  return data as MarketingChannel[];
}

export const fetchMarketingChannels = unstable_cache(
  fetchMarketingChannelsRaw,
  ["marketing-channels"],
  { revalidate: 60 }
);

// ================================================================
// マッピングルール取得
// ================================================================

async function fetchMappingRulesRaw(): Promise<MappingRule[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("channel_mapping_rules")
    .select("*")
    .order("priority", { ascending: true });

  if (error) {
    console.error("Failed to fetch channel_mapping_rules:", error);
    return [];
  }

  return data as MappingRule[];
}

export const fetchMappingRules = unstable_cache(
  fetchMappingRulesRaw,
  ["channel-mapping-rules"],
  { revalidate: 60 }
);

// ================================================================
// 帰属結果取得
// ================================================================

export interface ChannelAttribution {
  id: string;
  customer_id: string;
  marketing_channel: string;
  attribution_source: string;
  confidence: string;
  touch_first: string | null;
  touch_decision: string | null;
  touch_last: string | null;
  is_multi_touch: boolean;
  raw_data: Record<string, string | null> | null;
  computed_at: string;
}

async function fetchChannelAttributionsRaw(): Promise<ChannelAttribution[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("customer_channel_attribution")
    .select("*");

  if (error) {
    console.error("Failed to fetch customer_channel_attribution:", error);
    return [];
  }

  return data as ChannelAttribution[];
}

export const fetchChannelAttributions = unstable_cache(
  fetchChannelAttributionsRaw,
  ["channel-attributions"],
  { revalidate: 60 }
);

// ================================================================
// 帰属統計
// ================================================================

export interface AttributionStats {
  totalCustomers: number;
  attributedCount: number;
  unknownCount: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  byChannel: { channel: string; count: number }[];
}

export function computeAttributionStats(
  attributions: ChannelAttribution[]
): AttributionStats {
  const byChannel = new Map<string, number>();
  let unknownCount = 0;
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;

  for (const a of attributions) {
    if (a.marketing_channel === "不明") {
      unknownCount++;
    }
    byChannel.set(a.marketing_channel, (byChannel.get(a.marketing_channel) || 0) + 1);

    if (a.confidence === "high") highConfidence++;
    else if (a.confidence === "medium") mediumConfidence++;
    else lowConfidence++;
  }

  return {
    totalCustomers: attributions.length,
    attributedCount: attributions.length - unknownCount,
    unknownCount,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    byChannel: Array.from(byChannel.entries())
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count),
  };
}
