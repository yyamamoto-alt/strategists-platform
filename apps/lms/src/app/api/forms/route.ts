import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/forms - アクティブなフォーム一覧（受講生向け）
export async function GET() {
  const admin = createAdminClient();

  const { data: forms, error } = await admin
    .from("forms")
    .select("id, title, url, description, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // plan access を取得
  const { data: access } = await admin
    .from("form_plan_access")
    .select("form_id, plan_id");

  const accessMap: Record<string, string[]> = {};
  for (const a of (access || []) as { form_id: string; plan_id: string }[]) {
    if (!accessMap[a.form_id]) accessMap[a.form_id] = [];
    accessMap[a.form_id].push(a.plan_id);
  }

  const result = (forms || []).map((f: Record<string, unknown>) => ({
    ...f,
    plan_ids: accessMap[f.id as string] || [],
  }));

  return NextResponse.json(result);
}
