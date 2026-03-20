import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/forms/[id] - フォーム更新
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const admin = createAdminClient();

  const { plan_ids, ...formData } = body;

  if (Object.keys(formData).length > 0) {
    formData.updated_at = new Date().toISOString();
    const { error } = await admin.from("forms").update(formData).eq("id", id);
    if (error) {
      return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
    }
  }

  if (plan_ids !== undefined) {
    await admin.from("form_plan_access").delete().eq("form_id", id);
    if (plan_ids.length > 0) {
      await admin.from("form_plan_access").insert(
        plan_ids.map((pid: string) => ({ form_id: id, plan_id: pid }))
      );
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/forms/[id] - フォーム削除
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const admin = createAdminClient();

  const { error } = await admin.from("forms").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
