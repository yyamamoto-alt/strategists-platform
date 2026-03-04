import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";

// GET /api/student/plan — ログイン中受講生のプラン情報
export async function GET() {
  const session = await getLmsSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // admin/mentor はプラン制限なし
  if (session.role === "admin" || session.role === "mentor") {
    return NextResponse.json({ plan: null, target_attribute: null, role: session.role });
  }

  if (!session.customerId) {
    return NextResponse.json({ plan: null, target_attribute: null, role: session.role });
  }

  const supabase = createAdminClient();

  // customer → attribute 取得
  const { data: customer } = await supabase
    .from("customers")
    .select("attribute")
    .eq("id", session.customerId)
    .single() as { data: { attribute: string } | null };

  // contract → plan_name → plan_id
  const { data: contract } = await supabase
    .from("contracts")
    .select("plan_name")
    .eq("customer_id", session.customerId)
    .maybeSingle() as { data: { plan_name: string | null } | null };

  if (!contract?.plan_name) {
    return NextResponse.json({
      plan: null,
      target_attribute: customer?.attribute || null,
      role: session.role,
    });
  }

  // plan_name → plan via contract_plan_mapping
  const { data: mapping } = await supabase
    .from("contract_plan_mapping")
    .select("plan_id")
    .eq("contract_plan_name", contract.plan_name)
    .maybeSingle() as { data: { plan_id: string } | null };

  if (!mapping) {
    return NextResponse.json({
      plan: null,
      target_attribute: customer?.attribute || null,
      role: session.role,
    });
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("id", mapping.plan_id)
    .single();

  return NextResponse.json({
    plan,
    target_attribute: customer?.attribute || null,
    role: session.role,
  });
}
