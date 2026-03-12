import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { fetchCustomersWithRelations, fetchFirstPaidDates } from "@/lib/data/customers";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = parseInt(searchParams.get("limit") || "0", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const [allCustomers, attributions, firstPaidMap] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchChannelAttributions(),
    fetchFirstPaidDates(),
  ]);

  const attributionMap: Record<string, { customer_id: string; marketing_channel: string }> = {};
  for (const a of attributions) {
    attributionMap[a.customer_id] = a;
  }

  const total = allCustomers.length;
  const customers = limit > 0 ? allCustomers.slice(offset, offset + limit) : allCustomers;

  const res = NextResponse.json({ customers, attributionMap, firstPaidMap, total });
  res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  return res;
}

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
    revalidateTag("customers");
    revalidateTag("dashboard");
    return NextResponse.json(
      { id: customerId, warnings: errors },
      { status: 201 }
    );
  }

  // 帰属チャネル自動計算
  computeAttributionForCustomer(customerId).catch((err) => {
    console.error(`Attribution calculation failed for customer ${customerId}:`, err);
  });

  revalidateTag("customers");
  revalidateTag("dashboard");

  return NextResponse.json({ id: customerId }, { status: 201 });
}
