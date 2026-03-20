import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { session, error: authError } = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();
  const supabase = createServiceClient();

  const updateFields: Record<string, unknown> = {};

  if ("role" in body) updateFields.role = body.role;
  if ("display_name" in body) updateFields.display_name = body.display_name;
  if ("allowed_pages" in body) updateFields.allowed_pages = body.allowed_pages;
  if ("data_months_limit" in body) updateFields.data_months_limit = body.data_months_limit;
  if ("mask_pii" in body) updateFields.mask_pii = body.mask_pii;
  if ("can_edit_customers" in body) updateFields.can_edit_customers = body.can_edit_customers;
  if ("is_active" in body) updateFields.is_active = body.is_active;

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { error } = await db
    .from("user_roles")
    .update(updateFields)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
