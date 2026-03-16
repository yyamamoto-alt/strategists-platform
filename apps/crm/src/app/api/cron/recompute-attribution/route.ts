import { createServiceClient } from "@/lib/supabase/server";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";
import { isSystemAutomationEnabled } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/recompute-attribution
 * 帰属が「不明」の顧客 + 直近作成の顧客を再計算（日次バックアップ）
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

  // 「不明」の帰属を持つ顧客を取得
  const { data: unknownAttr } = await db
    .from("customer_channel_attribution")
    .select("customer_id")
    .eq("marketing_channel", "不明");

  // 帰属テーブルにまだない顧客を取得
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
    timestamp: new Date().toISOString(),
  });
}
