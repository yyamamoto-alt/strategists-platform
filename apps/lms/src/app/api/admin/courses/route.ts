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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
