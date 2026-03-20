import { createServiceClient } from "@/lib/supabase/server";
import { matchCustomer } from "@/lib/customer-matching";
import { NextResponse } from "next/server";

/**
 * POST /api/orders/rematch
 * 全 unmatched orders に対し matchCustomer() を実行し、紐付けを試みる
 */
export async function POST() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // unmatched orders を取得
  const { data: unmatchedOrders, error } = await db
    .from("orders")
    .select("id, contact_email, contact_phone, contact_name")
    .eq("match_status", "unmatched");

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  if (!unmatchedOrders || unmatchedOrders.length === 0) {
    return NextResponse.json({ matched: 0, still_unmatched: 0 });
  }

  let matched = 0;
  let stillUnmatched = 0;

  for (const order of unmatchedOrders) {
    const result = await matchCustomer(
      order.contact_email,
      order.contact_phone,
      null // name_kana は orders テーブルに未保存のためスキップ
    );

    if (result) {
      await db
        .from("orders")
        .update({
          customer_id: result.customer_id,
          match_status: "matched",
        })
        .eq("id", order.id);
      matched++;
    } else {
      stillUnmatched++;
    }
  }

  return NextResponse.json({
    matched,
    still_unmatched: stillUnmatched,
    total_processed: unmatchedOrders.length,
  });
}
