import { createServiceClient } from "@/lib/supabase/server";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";
import { logStageChange } from "@/lib/stage-audit";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

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

  revalidateTag("customers");
  revalidateTag("dashboard");

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
    // ステージ変更がある場合、変更前のステージを取得してaudit log記録
    if (body.pipeline.stage) {
      const { data: currentPipeline } = await db
        .from("sales_pipeline")
        .select("stage")
        .eq("customer_id", id)
        .maybeSingle();
      const oldStage = currentPipeline?.stage || null;
      if (oldStage !== body.pipeline.stage) {
        logStageChange({
          customer_id: id,
          old_stage: oldStage,
          new_stage: body.pipeline.stage,
          changed_by: "manual",
        }).catch(() => {});
      }
    }
    const { error } = await db
      .from("sales_pipeline")
      .update(body.pipeline)
      .eq("customer_id", id);
    if (error) errors.push(`sales_pipeline: ${error.message}`);
  }

  // contracts テーブル更新（未作成ならinsert）
  if (body.contract && Object.keys(body.contract).length > 0) {
    const { data: existingContract } = await db
      .from("contracts")
      .select("id")
      .eq("customer_id", id)
      .maybeSingle();
    if (existingContract) {
      const { error } = await db
        .from("contracts")
        .update(body.contract)
        .eq("customer_id", id);
      if (error) errors.push(`contracts: ${error.message}`);
    } else {
      const { error } = await db
        .from("contracts")
        .insert({ customer_id: id, ...body.contract });
      if (error) errors.push(`contracts: ${error.message}`);
    }
  }

  // learning_records テーブル更新
  if (body.learning && Object.keys(body.learning).length > 0) {
    const { error } = await db
      .from("learning_records")
      .update(body.learning)
      .eq("customer_id", id);
    if (error) errors.push(`learning_records: ${error.message}`);
  }

  // agent_records テーブル更新（未作成ならinsert）
  if (body.agent && Object.keys(body.agent).length > 0) {
    const { data: existing } = await db
      .from("agent_records")
      .select("id")
      .eq("customer_id", id)
      .maybeSingle();
    if (existing) {
      const { error } = await db
        .from("agent_records")
        .update(body.agent)
        .eq("customer_id", id);
      if (error) errors.push(`agent_records: ${error.message}`);
    } else {
      const { error } = await db
        .from("agent_records")
        .insert({ customer_id: id, ...body.agent });
      if (error) errors.push(`agent_records: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  // UTMやパイプライン情報が変更された可能性があるので帰属チャネルを再計算
  if (body.customer || body.pipeline) {
    computeAttributionForCustomer(id).catch(() => {});
  }

  revalidateTag("customers");
  revalidateTag("dashboard");

  return NextResponse.json({ success: true });
}
