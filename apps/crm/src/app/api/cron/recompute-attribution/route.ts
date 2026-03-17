import { createServiceClient } from "@/lib/supabase/server";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";
import { isSystemAutomationEnabled } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/recompute-attribution
 * 1. カルテの情報を顧客DB/パイプラインに反映
 * 2. 全顧客の帰属チャネルを再計算
 *
 * ?mode=full  → 全顧客を対象（デフォルト）
 * ?mode=unknown → 不明+未計算のみ
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("recompute-attribution"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "full";

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // ─── Step 0: カルテの情報を顧客DBに反映 ───
  let karteSynced = 0;

  const { data: karteFirstTouch } = await db
    .from("application_history")
    .select("customer_id, raw_data")
    .eq("source", "カルテ")
    .not("customer_id", "is", null);

  if (karteFirstTouch) {
    for (const row of karteFirstTouch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rd = row.raw_data as any;
      if (!rd) continue;

      const firstTouch = rd["弊塾を最初に知った場所"];
      const reason = rd["弊塾への面談申し込みのきっかけ、決め手 "] || rd["弊塾への面談申し込みのきっかけ、決め手"];

      // カルテの「弊塾を最初に知った場所」→ sales_pipeline.initial_channel に常に反映
      if (firstTouch) {
        await db
          .from("sales_pipeline")
          .update({ initial_channel: firstTouch })
          .eq("customer_id", row.customer_id);
        karteSynced++;
      }

      // カルテの「決め手」→ customers.application_reason_karte に常に反映
      if (reason) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const custUpdateObj: Record<string, any> = { application_reason_karte: reason };

        const { data: cust } = await db
          .from("customers")
          .select("application_reason")
          .eq("id", row.customer_id)
          .single();

        if (cust && (!cust.application_reason || cust.application_reason === "")) {
          custUpdateObj.application_reason = reason;
        }

        await db
          .from("customers")
          .update(custUpdateObj)
          .eq("id", row.customer_id);
        karteSynced++;
      }
    }
  }

  // ─── Step 1: 帰属チャネルを再計算 ───
  const { data: unknownAttr } = await db
    .from("customer_channel_attribution")
    .select("customer_id")
    .eq("marketing_channel", "不明");

  const unknownIds = (unknownAttr || []).map((r: { customer_id: string }) => r.customer_id);

  let toProcessIds: string[];

  if (mode === "full") {
    const { data: allCustomers } = await db
      .from("customers")
      .select("id")
      .order("created_at", { ascending: false });
    toProcessIds = (allCustomers || []).map((c: { id: string }) => c.id);
  } else {
    // unknown + missing
    const { data: allAttr } = await db
      .from("customer_channel_attribution")
      .select("customer_id");
    const attrSet = new Set((allAttr || []).map((r: { customer_id: string }) => r.customer_id));

    const { data: recentCustomers } = await db
      .from("customers")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(300);

    const missing = (recentCustomers || []).filter((c: { id: string }) => !attrSet.has(c.id));
    toProcessIds = [...new Set([...missing.map((c: { id: string }) => c.id), ...unknownIds])];
  }

  let processed = 0;
  let errors = 0;

  // バッチ並行処理（10件ずつ）
  const BATCH_SIZE = 10;
  for (let i = 0; i < toProcessIds.length; i += BATCH_SIZE) {
    const batch = toProcessIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((id) => computeAttributionForCustomer(id))
    );
    for (const r of results) {
      if (r.status === "fulfilled") processed++;
      else errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    mode,
    total: toProcessIds.length,
    processed,
    errors,
    unknown_before: unknownIds.length,
    karte_synced: karteSynced,
    timestamp: new Date().toISOString(),
  });
}
