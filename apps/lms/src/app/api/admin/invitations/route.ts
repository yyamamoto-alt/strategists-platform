import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/invitations
 * 招待一覧取得（管理者のみ）
 */
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("invitations")
    .select("id, email, display_name, token, expires_at, used_at, customer_id, created_at")
    .eq("role", "student")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
