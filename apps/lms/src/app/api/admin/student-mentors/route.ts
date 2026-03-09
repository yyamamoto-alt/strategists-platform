import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/admin/student-mentors?user_id=xxx
export async function GET(request: Request) {
  const session = await getLmsSession();
  if (!session || (session.role !== "admin" && session.role !== "mentor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  const supabase = createAdminClient();

  if (userId) {
    // 特定ユーザーのメンター一覧
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("student_mentors")
      .select("id, mentor_id, role, assigned_at, is_active, mentors(id, name, booking_url, line_url)")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("role", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  return NextResponse.json([]);
}

// POST /api/admin/student-mentors - メンターをアサイン
export async function POST(request: Request) {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { user_id, mentor_id, role = "sub" } = body;

  if (!user_id || !mentor_id) {
    return NextResponse.json({ error: "user_id and mentor_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // primaryに変更する場合、既存のprimaryを解除
  if (role === "primary") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("student_mentors")
      .update({ role: "sub", updated_at: new Date().toISOString() })
      .eq("user_id", user_id)
      .eq("role", "primary")
      .eq("is_active", true);
  }

  // 既に同じメンターがアサインされていないか確認
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("student_mentors")
    .select("id")
    .eq("user_id", user_id)
    .eq("mentor_id", mentor_id)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    // 既存のroleを更新
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("student_mentors")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return NextResponse.json({ updated: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("student_mentors")
    .insert({ user_id, mentor_id, role })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/admin/student-mentors - メンターを解除
export async function DELETE(request: Request) {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("student_mentors")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
