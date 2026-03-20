import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/admin/courses - コース一覧（含む教材紐付け）
export async function GET() {
  const admin = createAdminClient();

  const { data: courses, error } = await admin
    .from("courses")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  // 各コースの紐付け教材を取得
  const { data: links } = await admin
    .from("course_contents")
    .select("course_id, content_id, sort_order")
    .order("sort_order", { ascending: true });

  const linkMap: Record<string, { content_id: string; sort_order: number }[]> = {};
  for (const row of (links || []) as { course_id: string; content_id: string; sort_order: number }[]) {
    if (!linkMap[row.course_id]) linkMap[row.course_id] = [];
    linkMap[row.course_id].push({ content_id: row.content_id, sort_order: row.sort_order });
  }

  const result = (courses || []).map((c: any) => ({
    ...c,
    content_ids: (linkMap[c.id] || []).map((l) => l.content_id),
  }));

  return NextResponse.json(result);
}

// POST /api/admin/courses - コース作成
export async function POST(request: Request) {
  const body = await request.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("courses")
    .insert({
      title: body.title,
      target_attribute: body.target_attribute || null,
      category: "カリキュラム",
      status: "published",
      sort_order: body.sort_order || 99,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ ...data, content_ids: [] });
}
