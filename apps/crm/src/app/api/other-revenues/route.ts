import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  let query = db
    .from("other_revenues")
    .select("*")
    .order("revenue_date", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const body = await request.json();
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { category, title, amount, revenue_date, description } = body;

  if (!category || !title || amount == null || !revenue_date) {
    return NextResponse.json({ error: "category, title, amount, revenue_date は必須です" }, { status: 400 });
  }

  const { data, error } = await db
    .from("other_revenues")
    .insert({
      category,
      title,
      amount: Number(amount),
      revenue_date,
      description: description || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
