import { createServiceClient } from "@/lib/supabase/server";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";
import { isSystemAutomationEnabled } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/recompute-attribution
 * 1. カルテの情報を顧客DB/パイプラインに反映
 * 2. 帰属が「不明」の顧客 + 直近作成の顧客を再計算
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("recompute-attribution"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // ─── Step 0: カルテの情報を顧客DBに反映 ───
  let karteSynced = 0;

  // カルテの「弊塾を最初に知った場所」→ sales_pipeline.initial_channel
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
      // application_reason が空の場合は application_reason にも反映
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

  // ─── Step 1: 全顧客の帰属を再計算 ───
  // 「不明」だけでなく、カルテ同期後のデータ反映のために全顧客を対象にする
  const { data: allCustomers } = await db
    .from("customers")
    .select("id")
    .order("created_at", { ascending: false });

  const { data: unknownAttr } = await db
    .from("customer_channel_attribution")
    .select("customer_id")
    .eq("marketing_channel", "不明");

  const unknownIds = (unknownAttr || []).map((r: { customer_id: string }) => r.customer_id);

  const toProcess = new Set(
    (allCustomers || []).map((c: { id: string }) => c.id)
  );

  let processed = 0;
  let errors = 0;

  for (const id of toProcess) {
    try {
      await computeAttributionForCustomer(id as string);
      processed++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: toProcess.size,
    processed,
    errors,
    unknown_before: unknownIds.length,
    karte_synced: karteSynced,
    timestamp: new Date().toISOString(),
  });
}
