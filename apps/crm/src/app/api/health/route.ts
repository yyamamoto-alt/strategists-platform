import { createServiceClient } from "@/lib/supabase/server";
import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const envCheck = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_USE_MOCK: process.env.NEXT_PUBLIC_USE_MOCK,
  };

  let dbCheck = { ok: false, count: 0, error: "" };
  try {
    const supabase = createServiceClient();
    const { count, error } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true });
    dbCheck = { ok: !error, count: count || 0, error: error?.message || "" };
  } catch (e) {
    dbCheck.error = e instanceof Error ? e.message : "Unknown error";
  }

  let fetchCheck = { ok: false, count: 0, error: "", sample: "" };
  try {
    const customers = await fetchCustomersWithRelations();
    fetchCheck = {
      ok: true,
      count: customers.length,
      error: "",
      sample: customers.length > 0 ? customers[0].name : "(empty)",
    };
  } catch (e) {
    fetchCheck.error = e instanceof Error ? e.message : "Unknown error";
  }

  return NextResponse.json({ env: envCheck, db: dbCheck, fetch: fetchCheck });
}
