import { NextRequest, NextResponse } from "next/server";
import { getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// PATCH /api/modules/[id] — モジュール更新
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

  const updates: Record<string, any> = {};

  if ("title" in body) {
    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "モジュール名は必須です" }, { status: 400 });
    }
    updates.title = body.title.trim();
  }
  if ("sort_order" in body) updates.sort_order = body.sort_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("modules")
    .update(updates as any)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("modules PATCH error:", error);
    return NextResponse.json({ error: "モジュール更新に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/modules/[id] — モジュール削除
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
    .from("modules")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("modules DELETE error:", error);
    return NextResponse.json({ error: "モジュール削除に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
