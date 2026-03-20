import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("channel_mapping_rules")
    .select("*")
    .order("priority", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("channel_mapping_rules")
    .insert({
      source_field: body.source_field,
      source_value: body.source_value,
      match_type: body.match_type || "exact",
      channel_name: body.channel_name,
      notes: body.notes || null,
      priority: body.priority || 100,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
