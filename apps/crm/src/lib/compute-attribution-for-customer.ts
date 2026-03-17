import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { computeAttribution } from "@/lib/marketing-attribution";
import type { MappingRule, CustomerRawData } from "@/lib/marketing-attribution";

/**
 * 単一顧客の帰属チャネルを計算して customer_channel_attribution に upsert する。
 * 顧客作成・更新・Jicoo予約時など、都度呼び出す。
 */
export async function computeAttributionForCustomer(customerId: string): Promise<void> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // マッピングルールを取得
  const { data: rules } = await db
    .from("channel_mapping_rules")
    .select("*")
    .order("priority", { ascending: true });

  if (!rules || rules.length === 0) return;

  // 顧客データを取得
  const { data: customer } = await db
    .from("customers")
    .select("id, utm_source, utm_medium, utm_campaign, application_reason")
    .eq("id", customerId)
    .single();

  if (!customer) return;

  // パイプラインデータを取得
  const { data: pipeline } = await db
    .from("sales_pipeline")
    .select("initial_channel, sales_route")
    .eq("customer_id", customerId)
    .single();

  const rawData: CustomerRawData = {
    utm_source: customer.utm_source,
    utm_medium: customer.utm_medium,
    utm_campaign: customer.utm_campaign,
    initial_channel: pipeline?.initial_channel || null,
    application_reason: customer.application_reason,
    sales_route: pipeline?.sales_route || null,
  };

  const result = computeAttribution(rawData, rules as MappingRule[]);

  // upsert (customer_id はユニーク)
  await db.from("customer_channel_attribution").upsert(
    {
      customer_id: customerId,
      marketing_channel: result.marketing_channel,
      base_channel: result.base_channel,
      is_pure: result.is_pure,
      attribution_source: result.attribution_source,
      confidence: result.confidence,
      touch_first: result.touch_first,
      touch_decision: result.touch_decision,
      touch_last: result.touch_last,
      is_multi_touch: result.is_multi_touch,
      raw_data: result.raw_data,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "customer_id" }
  );
}
