import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { computeAttribution } from "@/lib/marketing-attribution";
import type { MappingRule, CustomerRawData } from "@/lib/marketing-attribution";

export async function POST() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 1. マッピングルールを取得
  const { data: rules, error: rulesError } = await db
    .from("channel_mapping_rules")
    .select("*")
    .order("priority", { ascending: true });

  if (rulesError) {
    return NextResponse.json(
      { error: `ルール取得失敗: ${rulesError.message}` },
      { status: 500 }
    );
  }

  // 2. 全顧客データを取得 (ページネーションで1000件制限を回避)
  const PAGE_SIZE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCustomers: any[] = [];
  let offset = 0;
  while (true) {
    const { data: batch, error: batchError } = await db
      .from("customers")
      .select("id, utm_source, utm_medium, utm_campaign, application_reason")
      .range(offset, offset + PAGE_SIZE - 1);
    if (batchError) {
      return NextResponse.json(
        { error: `顧客取得失敗: ${batchError.message}` },
        { status: 500 }
      );
    }
    if (!batch || batch.length === 0) break;
    allCustomers.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // パイプライン情報を別途取得 (ページネーション)
  const pipelineMap = new Map<string, { initial_channel: string | null; sales_route: string | null }>();
  offset = 0;
  while (true) {
    const { data: pipeBatch } = await db
      .from("sales_pipeline")
      .select("customer_id, initial_channel, sales_route")
      .range(offset, offset + PAGE_SIZE - 1);
    if (!pipeBatch || pipeBatch.length === 0) break;
    for (const p of pipeBatch) {
      pipelineMap.set(p.customer_id, {
        initial_channel: p.initial_channel,
        sales_route: p.sales_route,
      });
    }
    if (pipeBatch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // 3. 既存の帰属データを全削除
  const { error: deleteError } = await db
    .from("customer_channel_attribution")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // 全件削除

  if (deleteError) {
    return NextResponse.json(
      { error: `既存データ削除失敗: ${deleteError.message}` },
      { status: 500 }
    );
  }

  // 4. 各顧客の帰属を計算して挿入
  const mappingRules = rules as MappingRule[];
  const insertRows = [];
  let processed = 0;
  let errors = 0;

  for (const c of allCustomers) {
    const pipeline = pipelineMap.get(c.id);
    const rawData: CustomerRawData = {
      utm_source: c.utm_source,
      utm_medium: c.utm_medium,
      utm_campaign: c.utm_campaign,
      initial_channel: pipeline?.initial_channel || null,
      application_reason: c.application_reason,
      sales_route: pipeline?.sales_route || null,
    };

    const result = computeAttribution(rawData, mappingRules);

    insertRows.push({
      customer_id: c.id,
      marketing_channel: result.marketing_channel,
      attribution_source: result.attribution_source,
      confidence: result.confidence,
      touch_first: result.touch_first,
      touch_decision: result.touch_decision,
      touch_last: result.touch_last,
      is_multi_touch: result.is_multi_touch,
      raw_data: result.raw_data,
      computed_at: new Date().toISOString(),
    });
  }

  // バッチ挿入 (100件ずつ)
  const BATCH_SIZE = 100;
  for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
    const batch = insertRows.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await db
      .from("customer_channel_attribution")
      .insert(batch);

    if (insertError) {
      console.error(`Batch insert error at ${i}:`, insertError);
      errors += batch.length;
    } else {
      processed += batch.length;
    }
  }

  return NextResponse.json({
    success: true,
    processed,
    errors,
    total: allCustomers.length,
  });
}
