import { createServiceClient } from "@/lib/supabase/server";

/**
 * note売上の月次データを取得する
 * - 2024/07〜2025/07: ハードコードされた過去実績（other_revenuesテーブルから消失したため）
 * - 2025/08〜: ordersテーブル（source='note'）の購買レコードから集計
 */

// 2024/07〜2025/07の月次note売上実績
const HISTORICAL_NOTE_SALES: Record<string, number> = {
  "2024/07": 220180,
  "2024/08": 351420,
  "2024/09": 408920,
  "2024/10": 567720,
  "2024/11": 411360,
  "2024/12": 190920,
  "2025/01": 413060,
  "2025/02": 146840,
  "2025/03": 349120,
  "2025/04": 436900,
  "2025/05": 377000,
  "2025/06": 485200,
  "2025/07": 324320,
};

// 購買レコード方式の開始月（これ以降はordersテーブルから取得）
const ORDERS_START = "2025-08";

/**
 * note売上の月別合計を返す
 * @returns Record<period(YYYY/MM), amount>
 */
export async function fetchNoteSalesByMonth(): Promise<Record<string, number>> {
  const result: Record<string, number> = { ...HISTORICAL_NOTE_SALES };

  // 2025/08以降: ordersテーブルから取得
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: orders } = await db
    .from("orders")
    .select("amount, paid_at")
    .eq("source", "note")
    .gte("paid_at", `${ORDERS_START}-01T00:00:00Z`);

  if (orders) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const order of orders as any[]) {
      if (!order.paid_at || !order.amount) continue;
      const date = new Date(order.paid_at);
      const period = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;
      result[period] = (result[period] || 0) + Number(order.amount);
    }
  }

  return result;
}
