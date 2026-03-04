import { NextRequest, NextResponse } from "next/server";
import { getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/courses/[id] — コース詳細（modules+lessons含む）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getLmsSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // modules + lessons を別途取得
  const { data: modules } = await supabase
    .from("modules")
    .select("*")
    .eq("course_id", id)
    .order("sort_order", { ascending: true });

  const { data: lessons } = await supabase
    .from("lessons")
    .select("*")
    .eq("course_id", id)
    .order("sort_order", { ascending: true });

  // modules に lessons を紐付け
  const modulesWithLessons = (modules || []).map((mod: any) => ({
    ...mod,
    lessons: (lessons || []).filter((l: any) => l.module_id === mod.id),
  }));

  return NextResponse.json({ ...data, modules: modulesWithLessons });
}

// PATCH /api/courses/[id] — コース更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const allowedFields = [
    "title", "description", "category", "level",
    "duration_weeks", "is_active", "status", "slug",
    "thumbnail_url", "total_lessons", "sort_order",
  ];

  const updates: Record<string, any> = {};
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/courses/[id] — コース削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // modules 配下の lessons を先に削除（module_id はSET NULLだが course_id CASCADEで消える）
  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
