import { createServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";
import { logStageChange } from "@/lib/stage-audit";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

interface Props {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: Props) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
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
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  revalidateTag("customers");
  revalidateTag("dashboard");

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const supabase = createServiceClient();

  const errors: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // フィールドホワイトリスト（Mass Assignment防止）
  const ALLOWED_CUSTOMER_FIELDS = [
    "name", "email", "phone", "attribute", "gender", "application_date",
    "birth_date", "address", "university", "faculty", "graduation_year",
    "current_company", "current_position", "desired_industry", "desired_position",
    "annual_income", "desired_income", "notes", "data_origin", "referral_source",
    "utm_source", "utm_medium", "utm_campaign", "line_id", "name_kana",
    "agent_service_enrolled", "reskilling_subsidy_target",
  ];
  const ALLOWED_PIPELINE_FIELDS = [
    "stage", "projected_amount", "meeting_scheduled_date", "meeting_url",
    "sales_person", "jicoo_message", "notes", "close_date",
  ];
  const ALLOWED_CONTRACT_FIELDS = [
    "plan_name", "confirmed_amount", "billing_status", "enrollment_status",
    "contract_date", "payment_method", "installment_count", "subsidy_eligible",
    "referral_category", "progress_sheet_url", "notes",
  ];
  const ALLOWED_LEARNING_FIELDS = [
    "total_sessions", "completed_sessions", "contract_months",
    "coaching_start_date", "coaching_end_date", "mentor_name",
    "schedule_progress_rate", "notes",
  ];
  const ALLOWED_AGENT_FIELDS = [
    "offer_salary", "hire_rate", "offer_probability", "referral_fee_rate",
    "margin", "expected_referral_fee", "placement_confirmed", "placement_date",
    "placement_company", "agent_service_enrolled", "notes",
  ];

  function pickAllowed(obj: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in obj) result[key] = obj[key];
    }
    return result;
  }

  // customers テーブル更新
  if (body.customer && Object.keys(body.customer).length > 0) {
    const safeData = pickAllowed(body.customer, ALLOWED_CUSTOMER_FIELDS);
    if (Object.keys(safeData).length > 0) {
      const { error } = await db
        .from("customers")
        .update(safeData)
        .eq("id", id);
      if (error) errors.push(`customers: ${error.message}`);
    }
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
    const safePipeline = pickAllowed(body.pipeline, ALLOWED_PIPELINE_FIELDS);
    if (Object.keys(safePipeline).length > 0) {
      const { error } = await db
        .from("sales_pipeline")
        .update(safePipeline)
        .eq("customer_id", id);
      if (error) errors.push(`sales_pipeline: ${error.message}`);
    }
  }

  // contracts テーブル更新（未作成ならinsert）
  if (body.contract && Object.keys(body.contract).length > 0) {
    const safeContract = pickAllowed(body.contract, ALLOWED_CONTRACT_FIELDS);
    if (Object.keys(safeContract).length > 0) {
      const { data: existingContract } = await db
        .from("contracts")
        .select("id")
        .eq("customer_id", id)
        .maybeSingle();
      if (existingContract) {
        const { error } = await db
          .from("contracts")
          .update(safeContract)
          .eq("customer_id", id);
        if (error) errors.push(`contracts: ${error.message}`);
      } else {
        const { error } = await db
          .from("contracts")
          .insert({ customer_id: id, ...safeContract });
        if (error) errors.push(`contracts: ${error.message}`);
      }
    }
  }

  // learning_records テーブル更新
  if (body.learning && Object.keys(body.learning).length > 0) {
    const safeLearning = pickAllowed(body.learning, ALLOWED_LEARNING_FIELDS);
    if (Object.keys(safeLearning).length > 0) {
      const { error } = await db
        .from("learning_records")
        .update(safeLearning)
        .eq("customer_id", id);
      if (error) errors.push(`learning_records: ${error.message}`);
    }
  }

  // agent_records テーブル更新（未作成ならinsert）
  if (body.agent && Object.keys(body.agent).length > 0) {
    const safeAgent = pickAllowed(body.agent, ALLOWED_AGENT_FIELDS);
    if (Object.keys(safeAgent).length > 0) {
      const { data: existing } = await db
        .from("agent_records")
        .select("id")
        .eq("customer_id", id)
        .maybeSingle();
      if (existing) {
        const { error } = await db
          .from("agent_records")
          .update(safeAgent)
          .eq("customer_id", id);
        if (error) errors.push(`agent_records: ${error.message}`);
      } else {
        const { error } = await db
          .from("agent_records")
          .insert({ customer_id: id, ...safeAgent });
        if (error) errors.push(`agent_records: ${error.message}`);
      }
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
