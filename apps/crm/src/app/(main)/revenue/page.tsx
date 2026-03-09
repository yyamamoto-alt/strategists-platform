export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { computePLSheetData } from "@/lib/data/dashboard-metrics";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import { RevenueClient } from "./revenue-client";
import type { OtherRevenueSummary } from "./revenue-client";

export const revalidate = 60;

import { mockCustomers } from "@/lib/mock-data";

async function fetchOtherRevenueSummary(): Promise<OtherRevenueSummary> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from("other_revenues")
    .select("category, amount, revenue_date");

  const summary: OtherRevenueSummary = {};
  if (data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of data as any[]) {
      let period = (r.revenue_date as string).slice(0, 7).replace("-", "/");
      // MyVision受託は入金月ではなく役務提供月（-1ヶ月）に計上
      if (r.category === "myvision") {
        const [y, m] = period.split("/").map(Number);
        const d = new Date(y, m - 2, 1);
        period = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      if (!summary[period]) summary[period] = { note: 0, myvision: 0, other: 0 };
      const amount = Number(r.amount) || 0;
      if (r.category === "note") summary[period].note += amount;
      else if (r.category === "myvision") summary[period].myvision += amount;
      else summary[period].other += amount;
    }
  }
  return summary;
}

export default async function RevenuePage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    const plData = computePLSheetData(mockCustomers, {});
    return <RevenueClient plData={plData} />;
  }

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
