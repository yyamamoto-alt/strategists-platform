import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/orders/{id}
 * 注文レコードの編集
 */
export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const body = await request.json();
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const allowedFields = [
    "contact_name",
    "contact_email",
    "contact_phone",
    "amount",
    "product_name",
    "paid_at",
    "memo",
    "status",
    "payment_method",
    "order_type",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  revalidateTag("orders");
  revalidateTag("customers");
  revalidateTag("dashboard");

  return NextResponse.json(data);
}

/**
 * DELETE /api/orders/{id}
 * 注文レコードの削除
 */
export async function DELETE(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { error } = await db
    .from("orders")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  revalidateTag("orders");
  revalidateTag("customers");
  revalidateTag("dashboard");

  return NextResponse.json({ success: true });
}
