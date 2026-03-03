import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/unmatched
 * 未マッチ注文の一覧を返す
 */
export async function GET() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("orders")
    .select(
      "id, contact_email, contact_name, contact_phone, amount, product_name, source, paid_at, payment_method"
    )
    .eq("match_status", "unmatched")
    .order("paid_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
