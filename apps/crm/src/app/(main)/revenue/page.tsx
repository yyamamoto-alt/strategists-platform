export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { computePLSheetData } from "@/lib/data/dashboard-metrics";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import { fetchNoteSalesByMonth } from "@/lib/data/note-sales";
import { RevenueClient } from "./revenue-client";
import type { OtherRevenueSummary } from "./revenue-client";

export const revalidate = 60;

async function fetchOtherRevenueSummary(): Promise<OtherRevenueSummary> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // note売上: ハードコード過去分 + ordersテーブル（2025/8〜）
  const noteSalesByMonth = await fetchNoteSalesByMonth();

  // myvision/other: 引き続きother_revenuesテーブルから取得
  const { data } = await db
    .from("other_revenues")
    .select("category, amount, revenue_date")
    .neq("category", "note");

  const summary: OtherRevenueSummary = {};

  // note売上をマージ
  for (const [period, amount] of Object.entries(noteSalesByMonth)) {
    if (!summary[period]) summary[period] = { note: 0, myvision: 0, other: 0 };
    summary[period].note += amount;
  }

  // myvision/otherをマージ
  if (data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of data as any[]) {
      let period = (r.revenue_date as string).slice(0, 7).replace("-", "/");
      if (r.category === "myvision") {
        const [y, m] = period.split("/").map(Number);
        const d = new Date(y, m - 2, 1);
        period = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      if (!summary[period]) summary[period] = { note: 0, myvision: 0, other: 0 };
      const amount = Number(r.amount) || 0;
      if (r.category === "myvision") summary[period].myvision += amount;
      else summary[period].other += amount;
    }
  }
  return summary;
}

export default async function RevenuePage() {
  const [customers, attributions, otherRevenues] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchChannelAttributions(),
    fetchOtherRevenueSummary(),
  ]);

  const attributionMap: Record<string, (typeof attributions)[number]> = {};
  for (const attr of attributions) {
    attributionMap[attr.customer_id] = attr;
  }

  const plData = computePLSheetData(customers, attributionMap);

  return <RevenueClient plData={plData} otherRevenues={otherRevenues} />;
}
