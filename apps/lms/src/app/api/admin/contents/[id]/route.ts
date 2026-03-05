import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/contents/[id] - 教材更新
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const admin = createAdminClient();

  const { plan_ids, ...contentData } = body;

  if (Object.keys(contentData).length > 0) {
    contentData.updated_at = new Date().toISOString();
    const { error } = await admin.from("contents").update(contentData).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // プランアクセス更新
  if (plan_ids !== undefined) {
    await admin.from("content_plan_access").delete().eq("content_id", id);
    if (plan_ids.length > 0) {
      await admin.from("content_plan_access").insert(
        plan_ids.map((pid: string) => ({ content_id: id, plan_id: pid }))
      );
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/contents/[id] - 教材削除
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const admin = createAdminClient();

  const { error } = await admin.from("contents").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
