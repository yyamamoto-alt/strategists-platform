import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(request: Request) {
  const body = await request.json();
  const { customerId, field } = body;

  if (!customerId || !["identity_doc_verified", "bank_doc_verified", "contract_verified"].includes(field)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const db = supabase as any;

  // Get current value
  const { data: existing } = await db
    .from("subsidy_checks")
    .select("*")
    .eq("customer_id", customerId)
    .single();

  if (existing) {
    const newValue = !existing[field];
    const { error } = await db
      .from("subsidy_checks")
      .update({ [field]: newValue, updated_at: new Date().toISOString() })
      .eq("customer_id", customerId);
    if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
    return NextResponse.json({ [field]: newValue });
  } else {
    const { error } = await db
      .from("subsidy_checks")
      .insert({ customer_id: customerId, [field]: true });
    if (error) return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    return NextResponse.json({ [field]: true });
  }
}
