import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { name, email, phone, attribute, application_date, stage } = body;

  if (!name || !attribute) {
    return NextResponse.json(
      { error: "名前と属性は必須です" },
      { status: 400 }
    );
  }

  // 顧客作成
  const { data: customer, error: customerError } = await db
    .from("customers")
    .insert({
      name,
      email: email || null,
      phone: phone || null,
      attribute,
      application_date: application_date || new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  if (customerError || !customer) {
    return NextResponse.json(
      { error: customerError?.message || "顧客作成に失敗しました" },
      { status: 500 }
    );
  }

  const customerId = customer.id;

  // 関連テーブルを初期化
  const initPromises = [
    db.from("sales_pipeline").insert({ customer_id: customerId, stage: stage || "問い合わせ" }),
    db.from("contracts").insert({ customer_id: customerId }),
    db.from("learning_records").insert({ customer_id: customerId }),
    db.from("agent_records").insert({ customer_id: customerId }),
  ];

  const results = await Promise.all(initPromises);
  const errors = results
    .map((r: { error: { message: string } | null }, i: number) =>
      r.error ? `table${i}: ${r.error.message}` : null
    )
    .filter(Boolean);

  if (errors.length > 0) {
    return NextResponse.json(
      { id: customerId, warnings: errors },
      { status: 201 }
    );
  }

  return NextResponse.json({ id: customerId }, { status: 201 });
}
