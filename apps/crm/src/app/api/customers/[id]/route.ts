import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface Props {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 関連テーブルを先に削除
  const relatedTables = [
    "application_history",
    "customer_emails",
    "activities",
    "agent_records",
    "learning_records",
    "contracts",
    "sales_pipeline",
    "unmatched_records",
  ];

  for (const table of relatedTables) {
    await db.from(table).delete().eq("customer_id", id);
  }

  // 顧客本体を削除
  const { error } = await db.from("customers").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const body = await request.json();
  const supabase = createServiceClient();

  const errors: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // customers テーブル更新
  if (body.customer && Object.keys(body.customer).length > 0) {
    const { error } = await db
      .from("customers")
      .update(body.customer)
      .eq("id", id);
    if (error) errors.push(`customers: ${error.message}`);
  }

  // sales_pipeline テーブル更新
  if (body.pipeline && Object.keys(body.pipeline).length > 0) {
    const { error } = await db
      .from("sales_pipeline")
      .update(body.pipeline)
      .eq("customer_id", id);
    if (error) errors.push(`sales_pipeline: ${error.message}`);
  }

  // contracts テーブル更新
  if (body.contract && Object.keys(body.contract).length > 0) {
    const { error } = await db
      .from("contracts")
      .update(body.contract)
      .eq("customer_id", id);
    if (error) errors.push(`contracts: ${error.message}`);
  }

  // learning_records テーブル更新
  if (body.learning && Object.keys(body.learning).length > 0) {
    const { error } = await db
      .from("learning_records")
      .update(body.learning)
      .eq("customer_id", id);
    if (error) errors.push(`learning_records: ${error.message}`);
  }

  // agent_records テーブル更新
  if (body.agent && Object.keys(body.agent).length > 0) {
    const { error } = await db
      .from("agent_records")
      .update(body.agent)
      .eq("customer_id", id);
    if (error) errors.push(`agent_records: ${error.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
