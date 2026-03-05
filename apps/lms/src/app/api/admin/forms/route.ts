import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/admin/forms - フォーム一覧（plan_ids付き）
export async function GET() {
  const admin = createAdminClient();

  const { data: forms, error } = await admin
    .from("forms")
    .select("*")
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

// POST /api/admin/forms - フォーム追加
export async function POST(request: Request) {
  const body = await request.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("forms")
    .insert({
      title: body.title,
      url: body.url,
      description: body.description || null,
      sort_order: body.sort_order || 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // plan_ids があれば設定
  if (body.plan_ids?.length > 0) {
    await admin.from("form_plan_access").insert(
      body.plan_ids.map((pid: string) => ({ form_id: data.id, plan_id: pid }))
    );
  }

  return NextResponse.json(data);
}
