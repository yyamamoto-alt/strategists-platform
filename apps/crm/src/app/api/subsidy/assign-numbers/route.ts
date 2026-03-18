import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const SUBSIDY_NUMBER_START = 100001;

/**
 * POST /api/subsidy/assign-numbers
 * 補助金対象者に識別番号を付与する
 * - 既に番号がある人は変更しない
 * - 未付番の人のみ、入金日→入塾日→申込日の早い順に番号を付与
 */
export async function POST() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 1. 補助金対象の契約を取得
  const { data: contracts, error } = await db
    .from("contracts")
    .select(`
      id,
      customer_id,
      subsidy_eligible,
      subsidy_number,
      payment_date,
      customer:customers!inner(id, name, application_date)
    `)
    .eq("subsidy_eligible", true);

  if (error) {
    console.error("Failed to fetch contracts:", error);
    return NextResponse.json({ error: `データ取得に失敗しました: ${error.message}` }, { status: 500 });
  }

  // 2. 対象顧客のcustomer_idを収集してpipelineを別クエリで取得
  const customerIds = (contracts || []).map((c: Record<string, unknown>) => c.customer_id);
  const { data: pipelines, error: pipelineError } = await db
    .from("sales_pipeline")
    .select("customer_id, stage, sales_date")
    .in("customer_id", customerIds);

  if (pipelineError) {
    console.error("Failed to fetch pipelines:", pipelineError);
    return NextResponse.json({ error: `パイプライン取得に失敗しました: ${pipelineError.message}` }, { status: 500 });
  }

  // customer_id → pipeline のマップ
  const pipelineMap: Record<string, { stage: string; sales_date: string | null }> = {};
  for (const p of pipelines || []) {
    pipelineMap[p.customer_id] = { stage: p.stage, sales_date: p.sales_date };
  }

  // 3. 成約者のみフィルタ（テスト顧客除外）
  const eligible = (contracts || []).filter((c: Record<string, unknown>) => {
    const customer = c.customer as Record<string, unknown> | null;
    if (!customer) return false;
    const name = (customer.name as string) || "";
    if (name.includes("テスト")) return false;
    const pipeline = pipelineMap[c.customer_id as string];
    return pipeline?.stage === "成約";
  });

  // 4. 既に付番済みの最大番号を取得
  const existingMax = eligible.reduce((max: number, c: Record<string, unknown>) => {
    const num = c.subsidy_number as number | null;
    return num && num > max ? num : max;
  }, SUBSIDY_NUMBER_START - 1);

  // 5. 未付番の人を日付順にソート（入金日 → 申込日 → sales_date）
  const unassigned = eligible.filter((c: Record<string, unknown>) => !c.subsidy_number);

  unassigned.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const getDate = (c: Record<string, unknown>): string => {
      const payDate = c.payment_date as string | null;
      const customer = c.customer as Record<string, unknown>;
      const appDate = customer?.application_date as string | null;
      const pipeline = pipelineMap[c.customer_id as string];
      const salesDate = pipeline?.sales_date || null;
      return payDate || appDate || salesDate || "9999-12-31";
    };
    return getDate(a).localeCompare(getDate(b));
  });

  // 6. 番号を付与
  let nextNumber = existingMax + 1;
  const updates: Array<{ id: string; subsidy_number: number; customer_name: string }> = [];

  for (const contract of unassigned) {
    const c = contract as Record<string, unknown>;
    const customer = c.customer as Record<string, unknown>;
    const { error: updateError } = await db
      .from("contracts")
      .update({ subsidy_number: nextNumber })
      .eq("id", c.id);

    if (!updateError) {
      updates.push({
        id: c.id as string,
        subsidy_number: nextNumber,
        customer_name: (customer?.name as string) || "",
      });
      nextNumber++;
    }
  }

  return NextResponse.json({
    success: true,
    assigned: updates.length,
    totalEligible: eligible.length,
    updates,
  });
}
