import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("courses")
    .select("id, title")
    .eq("is_active", true)
    .order("sort_order");
  return NextResponse.json({ courses: data || [] });
}
