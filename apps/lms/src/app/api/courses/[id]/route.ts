import { NextRequest, NextResponse } from "next/server";
import { getLmsSession, createLmsServerClient } from "@/lib/supabase/server";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createLmsServerClient() as any;

  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "コースが見つかりません" }, { status: 404 });
  }

  // admin以外は非公開コースにアクセス不可
  if (session.role !== "admin" && !data.is_active) {
    return NextResponse.json({ error: "コースが見つかりません" }, { status: 404 });
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 });
  }

  // duration_weeks のバリデーション
  if ("duration_weeks" in updates) {
    updates.duration_weeks = Math.max(1, Math.min(52, Number(updates.duration_weeks) || 12));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createLmsServerClient() as any;

  const { data, error } = await supabase
    .from("courses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("courses PATCH error:", error);
    return NextResponse.json({ error: "コース更新に失敗しました" }, { status: 500 });
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createLmsServerClient() as any;

  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("courses DELETE error:", error);
    return NextResponse.json({ error: "コース削除に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
