import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/courses/[id] - コースの教材選択を更新
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const admin = createAdminClient();

  const { content_ids, ...courseData } = body;

  // コース基本情報更新
  if (Object.keys(courseData).length > 0) {
    courseData.updated_at = new Date().toISOString();
    const { error } = await admin.from("courses").update(courseData).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // 教材紐付け更新
  if (content_ids !== undefined) {
    await admin.from("course_contents").delete().eq("course_id", id);
    if (content_ids.length > 0) {
      await admin.from("course_contents").insert(
        content_ids.map((cid: string, i: number) => ({
          course_id: id,
          content_id: cid,
          sort_order: i,
        }))
      );
    }
  }

  return NextResponse.json({ success: true });
}
