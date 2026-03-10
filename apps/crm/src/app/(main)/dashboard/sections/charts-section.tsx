import { createServiceClient } from "@/lib/supabase/server";
import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetricsBySegment,
  computeRevenueMetrics,
  computeThreeTierRevenue,
} from "@/lib/data/dashboard-metrics";
import { fetchNoteSalesByMonth } from "@/lib/data/note-sales";
import { ChartsClient } from "./charts-client";

export async function ChartsSection() {
  const customers = await fetchCustomersWithRelations();

  const funnelBySegment = computeFunnelMetricsBySegment(customers);
  const revenueMetrics = computeRevenueMetrics(customers);
  const threeTierRevenue = computeThreeTierRevenue(customers);

  // その他売上（note/MyVision）を取得してThreeTierRevenueにマージ
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const noteSalesByMonth = await fetchNoteSalesByMonth();

  const { data: otherRevenues } = await db
    .from("other_revenues")
    .select("category, amount, revenue_date")
    .neq("category", "note");

  const otherByMonth: Record<string, { note: number; myvision: number; other: number }> = {};

  for (const [period, amount] of Object.entries(noteSalesByMonth)) {
    if (!otherByMonth[period]) otherByMonth[period] = { note: 0, myvision: 0, other: 0 };
    otherByMonth[period].note += amount;
  }

  if (otherRevenues && otherRevenues.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of otherRevenues as any[]) {
      let period = (r.revenue_date as string).slice(0, 7).replace("-", "/");
      if (r.category === "myvision") {
        const [y, m] = period.split("/").map(Number);
        const d = new Date(y, m - 2, 1);
        period = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      if (!otherByMonth[period]) otherByMonth[period] = { note: 0, myvision: 0, other: 0 };
      const amount = Number(r.amount) || 0;
      if (r.category === "myvision") otherByMonth[period].myvision += amount;
      else otherByMonth[period].other += amount;
    }
  }

  const existingPeriods = new Set(threeTierRevenue.map((t) => t.period));
  for (const [period, amounts] of Object.entries(otherByMonth)) {
    const otherTotal = amounts.note + amounts.myvision + amounts.other;
    if (otherTotal === 0) continue;
    const existing = threeTierRevenue.find((t) => t.period === period);
    if (existing) {
      existing.content_revenue = (existing.content_revenue || 0) + amounts.note;
      existing.myvision_revenue = (existing.myvision_revenue || 0) + amounts.myvision;
      existing.other_misc_revenue = (existing.other_misc_revenue || 0) + amounts.other;
      existing.confirmed_total += otherTotal;
      existing.projected_total += otherTotal;
      existing.expected_ltv_total += otherTotal;
    } else if (!existingPeriods.has(period)) {
      threeTierRevenue.push({
        period,
        confirmed_school: 0, confirmed_school_kisotsu: 0, confirmed_school_shinsotsu: 0,
        confirmed_agent: 0, confirmed_subsidy: 0,
        confirmed_total: otherTotal,
        projected_agent: 0, projected_total: otherTotal,
        forecast_total: otherTotal, expected_ltv_total: otherTotal,
        content_revenue: amounts.note,
        myvision_revenue: amounts.myvision,
        other_misc_revenue: amounts.other,
      });
    }
  }
  threeTierRevenue.sort((a, b) => a.period.localeCompare(b.period));

  return (
    <ChartsClient
      revenueMetrics={revenueMetrics}
      threeTierRevenue={threeTierRevenue}
      funnelMetrics={funnelBySegment.all}
      funnelKisotsu={funnelBySegment.kisotsu}
      funnelShinsotsu={funnelBySegment.shinsotsu}
    />
  );
}
