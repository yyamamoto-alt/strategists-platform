import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/orders/{id}/match
 * { action: "link", customer_id: "..." } → customer_id設定 + match_status='manual'
 * { action: "create" }                   → 新規顧客作成後に紐付け
 * { action: "ignore" }                   → match_status='manual'
 */
export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const body = await request.json();
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { action, customer_id } = body;

  if (action === "link" && customer_id) {
    // 既存顧客に紐付け
    const { data: order } = await db
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // メールがあれば customer_emails に追加
    if (order.contact_email) {
      await db
        .from("customer_emails")
        .upsert(
          {
            customer_id,
            email: order.contact_email.trim().toLowerCase(),
            is_primary: false,
          },
          { onConflict: "email" }
        );
    }

    // orders を更新
    const { data, error } = await db
      .from("orders")
      .update({
        customer_id,
        match_status: "manual",
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  if (action === "create") {
    // 注文情報を取得
    const { data: order } = await db
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 新規顧客作成
    const { data: newCustomer, error: createError } = await db
      .from("customers")
      .insert({
        name: order.contact_name || "未入力",
        email: order.contact_email || null,
        phone: order.contact_phone || null,
        application_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    // customer_emails に追加
    if (order.contact_email) {
      await db.from("customer_emails").insert({
        customer_id: newCustomer.id,
        email: order.contact_email.trim().toLowerCase(),
        is_primary: true,
      });
    }

    // sales_pipeline を作成
    await db.from("sales_pipeline").insert({
      customer_id: newCustomer.id,
      stage: "問い合わせ",
      deal_status: "未対応",
    });

    // orders を更新
    const { data, error } = await db
      .from("orders")
      .update({
        customer_id: newCustomer.id,
        match_status: "manual",
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ...data, new_customer_id: newCustomer.id });
  }

  if (action === "ignore") {
    const { data, error } = await db
      .from("orders")
      .update({ match_status: "manual" })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
