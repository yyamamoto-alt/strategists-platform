import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/mypage - ログインユーザーの顧客情報を返す
export async function GET() {
  const session = await getLmsSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const email = session.user.email;

  // メールアドレスで顧客を検索
  const { data: customer } = await admin
    .from("customers")
    .select("id, name, email, phone, attribute, university, faculty, career_history, target_companies, target_firm_type, transfer_intent")
    .eq("email", email)
    .maybeSingle() as { data: Record<string, unknown> | null };

  if (!customer) {
    return NextResponse.json({ customer: null, contract: null, learning: null });
  }

  // 契約情報
  const { data: contract } = await admin
    .from("contracts")
    .select("plan_name, contract_date")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { plan_name: string; contract_date: string } | null };

  // 学習情報
  const { data: learning } = await admin
    .from("learning_records")
    .select("coaching_start_date, total_sessions, remaining_sessions")
    .eq("customer_id", customer.id)
    .maybeSingle() as { data: { coaching_start_date: string; total_sessions: number; remaining_sessions: number } | null };

  // 顧客IDは返さない（内部情報）
  const { id: _id, ...safeCustomer } = customer;

  return NextResponse.json({
    customer: safeCustomer,
    contract,
    learning,
  });
}
