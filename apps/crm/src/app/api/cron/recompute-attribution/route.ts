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

      // initial_channel が空の場合のみ反映
      if (firstTouch) {
        const { data: existing } = await db
          .from("sales_pipeline")
          .select("initial_channel")
          .eq("customer_id", row.customer_id)
          .single();

        if (existing && (!existing.initial_channel || existing.initial_channel === "")) {
          await db
            .from("sales_pipeline")
            .update({ initial_channel: firstTouch })
            .eq("customer_id", row.customer_id);
          karteSynced++;
        }
      }

      // application_reason が空の場合のみ反映
      if (reason) {
        const { data: cust } = await db
          .from("customers")
          .select("application_reason")
          .eq("id", row.customer_id)
          .single();

        if (cust && (!cust.application_reason || cust.application_reason === "")) {
          await db
            .from("customers")
            .update({ application_reason: reason })
            .eq("id", row.customer_id);
          karteSynced++;
        }
      }
    }
  }

  // ─── Step 1: 「不明」の帰属を持つ顧客を取得 ───
  const { data: unknownAttr } = await db
    .from("customer_channel_attribution")
    .select("customer_id")
    .eq("marketing_channel", "不明");

  // ─── Step 2: 帰属テーブルにまだない顧客を取得 ───
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
  const unknownIds = (unknownAttr || []).map((r: { customer_id: string }) => r.customer_id);

  const toProcess = new Set([
    ...missing.map((c: { id: string }) => c.id),
    ...unknownIds,
  ]);

  let processed = 0;
  let errors = 0;

  for (const id of toProcess) {
    try {
      await computeAttributionForCustomer(id);
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
    missing_before: missing.length,
    karte_synced: karteSynced,
    timestamp: new Date().toISOString(),
  });
}
