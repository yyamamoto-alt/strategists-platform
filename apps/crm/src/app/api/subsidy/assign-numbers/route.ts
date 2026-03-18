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

  // 補助金対象の成約者を取得（テスト除外）
  const { data: contracts, error } = await db
    .from("contracts")
    .select(`
      id,
      customer_id,
      subsidy_eligible,
      subsidy_number,
      payment_date,
      customer:customers!inner(id, name, application_date, pipeline:sales_pipeline(sales_date, stage))
    `)
    .eq("subsidy_eligible", true)
    .not("customer.name", "like", "%テスト%");

  if (error) {
    console.error("Failed to fetch contracts:", error);
    return NextResponse.json({ error: "データ取得に失敗しました" }, { status: 500 });
  }

  // 成約者のみフィルタ
  const eligible = (contracts || []).filter((c: Record<string, unknown>) => {
    const pipeline = (c.customer as Record<string, unknown>)?.pipeline;
    if (Array.isArray(pipeline) && pipeline.length > 0) {
      return pipeline[0].stage === "成約";
    }
    return false;
  });

  // 既に付番済みの最大番号を取得
  const existingMax = eligible.reduce((max: number, c: Record<string, unknown>) => {
    const num = c.subsidy_number as number | null;
    return num && num > max ? num : max;
  }, SUBSIDY_NUMBER_START - 1);

  // 未付番の人を日付順にソート（入金日 → 申込日 → sales_date）
  const unassigned = eligible.filter((c: Record<string, unknown>) => !c.subsidy_number);

  unassigned.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const getDate = (c: Record<string, unknown>): string => {
      const payDate = c.payment_date as string | null;
      const customer = c.customer as Record<string, unknown>;
      const appDate = customer?.application_date as string | null;
      const pipeline = customer?.pipeline as Array<Record<string, unknown>>;
      const salesDate = pipeline?.[0]?.sales_date as string | null;
      return payDate || appDate || salesDate || "9999-12-31";
    };
    return getDate(a).localeCompare(getDate(b));
  });

  // 番号を付与
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
