import { NextRequest, NextResponse } from "next/server";
import { getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/courses/[id]/modules — モジュール一覧（lessons含む）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: modules, error } = await supabase
    .from("modules")
    .select("*")
    .eq("course_id", id)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 各モジュールにlessonsを紐付け
  const { data: lessons } = await supabase
    .from("lessons")
    .select("*")
    .eq("course_id", id)
    .order("sort_order", { ascending: true });

  const result = (modules || []).map((mod: any) => ({
    ...mod,
    lessons: (lessons || []).filter((l: any) => l.module_id === mod.id),
  }));

  return NextResponse.json(result);
}

// POST /api/courses/[id]/modules — モジュール追加
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { title } = body;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // sort_order: 既存最大値 + 1
  const { data: maxOrder } = await supabase
    .from("modules")
    .select("sort_order")
    .eq("course_id", id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { sort_order: number } | null };

  const { data, error } = await supabase
    .from("modules")
    .insert({
      course_id: id,
      title,
      sort_order: (maxOrder?.sort_order || 0) + 1,
    } as any)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
