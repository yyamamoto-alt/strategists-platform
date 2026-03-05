import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("courses")
    .select("id, title")
    .eq("is_active", true)
    .order("sort_order");
  return NextResponse.json({ courses: data || [] });
}
