import { createServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { NextResponse } from "next/server";

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await request.json();
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // フィールドホワイトリスト（Mass Assignment防止）
  const ALLOWED_FIELDS = ["channel_id", "field", "operator", "value", "priority", "is_active"];
  const safeBody: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) safeBody[key] = body[key];
  }

  const { data, error } = await db
    .from("channel_mapping_rules")
    .update({ ...safeBody, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: Props) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { error } = await db
    .from("channel_mapping_rules")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
