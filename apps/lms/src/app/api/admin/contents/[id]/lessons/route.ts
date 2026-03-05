import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/admin/contents/[id]/lessons - 教材内レッスン一覧
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("lessons")
    .select("*")
    .eq("content_id", id)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// POST /api/admin/contents/[id]/lessons - レッスン追加
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const admin = createAdminClient();

  // 現在の最大sort_orderを取得
  const { data: existing } = await admin
    .from("lessons")
    .select("sort_order")
    .eq("content_id", id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0
    ? (existing[0] as { sort_order: number }).sort_order + 1
    : 0;

  const { data, error } = await admin
    .from("lessons")
    .insert({
      content_id: id,
      title: body.title,
      lesson_type: body.lesson_type || "テキスト",
      sort_order: nextOrder,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
