import { NextRequest, NextResponse } from "next/server";
import { getLmsSession, createLmsServerClient } from "@/lib/supabase/server";

// POST /api/modules/[id]/lessons — レッスン追加
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: moduleId } = await params;
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

  const { title, description, lesson_type, video_url, markdown_content, duration_minutes } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "レッスンタイトルは必須です" }, { status: 400 });
  }

  const supabase = await createLmsServerClient();

  // moduleからcourse_idを取得
  const { data: mod, error: modError } = await supabase
    .from("modules")
    .select("course_id")
    .eq("id", moduleId)
    .single();

  if (modError || !mod) {
    return NextResponse.json({ error: "モジュールが見つかりません" }, { status: 404 });
  }

  // sort_order: 同モジュール内の既存最大値 + 1
  const { data: maxOrder } = await supabase
    .from("lessons")
    .select("sort_order")
    .eq("module_id", moduleId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { sort_order: number } | null };

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      course_id: (mod as any).course_id,
      module_id: moduleId,
      title: title.trim(),
      description: description || null,
      lesson_type: lesson_type || "テキスト",
      video_url: video_url || null,
      markdown_content: markdown_content || null,
      duration_minutes: duration_minutes ? Math.max(0, Number(duration_minutes)) : null,
      sort_order: (maxOrder?.sort_order ?? 0) + 1,
      is_active: true,
      copy_protected: true,
    } as any)
    .select()
    .single();

  if (error) {
    console.error("lessons POST error:", error);
    return NextResponse.json({ error: "レッスン追加に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
