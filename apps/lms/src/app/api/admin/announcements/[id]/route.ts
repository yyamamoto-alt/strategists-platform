import { NextRequest, NextResponse } from "next/server";
import { getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// PATCH /api/admin/announcements/[id] — お知らせ更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const allowedFields = ["title", "content", "priority", "published_at", "is_active"];
  const updates: Record<string, any> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("announcements")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("announcements PATCH error:", error);
    return NextResponse.json({ error: "お知らせの更新に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/announcements/[id] — お知らせ論理削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("announcements")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("announcements DELETE error:", error);
    return NextResponse.json({ error: "お知らせの削除に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}
