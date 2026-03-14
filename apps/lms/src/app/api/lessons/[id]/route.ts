import { NextRequest, NextResponse } from "next/server";
import { getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/lessons/[id] — レッスン詳細
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
    .from("lessons")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "レッスンが見つかりません" }, { status: 404 });
  }

  // admin以外は非アクティブレッスンにアクセス不可
  if (session.role !== "admin" && !data.is_active) {
    return NextResponse.json({ error: "レッスンが見つかりません" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// PATCH /api/lessons/[id] — レッスン更新
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
    "title", "description", "lesson_type", "video_url",
    "markdown_content", "content_format", "duration_minutes", "sort_order",
    "is_active", "copy_protected", "thumbnail_url",
  ];

  const updates: Record<string, any> = {};
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 });
  }

  // duration_minutes のバリデーション
  if ("duration_minutes" in updates && updates.duration_minutes !== null) {
    updates.duration_minutes = Math.max(0, Number(updates.duration_minutes) || 0);
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("lessons")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("lessons PATCH error:", error);
    return NextResponse.json({ error: "レッスン更新に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/lessons/[id] — レッスン削除
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

  const { error } = await supabase
    .from("lessons")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("lessons DELETE error:", error);
    return NextResponse.json({ error: "レッスン削除に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
