import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/admin/contents - 教材一覧
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("contents")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 各教材のプランアクセス情報も取得
  const { data: accessData } = await admin
    .from("content_plan_access")
    .select("content_id, plan_id");

  const accessMap: Record<string, string[]> = {};
  for (const row of (accessData || []) as { content_id: string; plan_id: string }[]) {
    if (!accessMap[row.content_id]) accessMap[row.content_id] = [];
    accessMap[row.content_id].push(row.plan_id);
  }

  // 各教材のレッスン数も取得
  const { data: lessonCounts } = await admin
    .from("lessons")
    .select("content_id");

  const countMap: Record<string, number> = {};
  for (const row of (lessonCounts || []) as { content_id: string | null }[]) {
    if (row.content_id) {
      countMap[row.content_id] = (countMap[row.content_id] || 0) + 1;
    }
  }

  const contents = (data || []).map((c: any) => ({
    ...c,
    plan_ids: accessMap[c.id] || [],
    lesson_count: countMap[c.id] || 0,
  }));

  return NextResponse.json(contents);
}

// POST /api/admin/contents - 教材作成
export async function POST(request: Request) {
  const body = await request.json();
  const admin = createAdminClient();

  const { plan_ids, ...contentData } = body;

  const { data, error } = await admin
    .from("contents")
    .insert(contentData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // プランアクセス設定
  if (plan_ids?.length > 0) {
    await admin.from("content_plan_access").insert(
      plan_ids.map((pid: string) => ({ content_id: data.id, plan_id: pid }))
    );
  }

  return NextResponse.json(data);
}
