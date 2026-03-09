export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { fetchCustomersWithRelations } from "@/lib/data/customers";
import {
  computeFunnelMetricsBySegment,
  computeRevenueMetrics,
  computeThreeTierRevenue,
  computeChannelTrends,
  fetchDashboardData,
} from "@/lib/data/dashboard-metrics";
import { fetchLatestInsights } from "@/lib/data/insights";
import { fetchChannelAttributions } from "@/lib/data/marketing-settings";
import { DashboardClient } from "./dashboard-client";

export const revalidate = 60;

// モックデータ（フォールバック用）
import {
  mockFunnelMetrics,
  mockRevenueMetrics,
  mockCustomers,
} from "@/lib/mock-data";

export default async function DashboardPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    const totalCustomers = mockCustomers.length;
    const closedCount = mockCustomers.filter(
      (c) => c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済"
    ).length;

    return (
      <DashboardClient
        totalCustomers={totalCustomers}
        closedCount={closedCount}
        funnelMetrics={mockFunnelMetrics}
        revenueMetrics={mockRevenueMetrics}
      />
    );
  }

  // 実データモード
  const [customers, dashboardData, insights, attributionMap] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchDashboardData(),
    fetchLatestInsights(),
    fetchChannelAttributions(),
  ]);

  // 配列 → Record<customer_id, attribution> 変換
  const attrRecord: Record<string, (typeof attributionMap)[number]> = {};
  for (const a of attributionMap) {
    attrRecord[a.customer_id] = a;
  }

  const funnelBySegment = computeFunnelMetricsBySegment(customers);
  const revenueMetrics = computeRevenueMetrics(customers);
  const threeTierRevenue = computeThreeTierRevenue(customers);
  const channelTrends = computeChannelTrends(customers, attrRecord);

  // その他売上（note/MyVision）を取得してThreeTierRevenueにマージ
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: otherRevenues } = await db
    .from("other_revenues")
    .select("category, amount, revenue_date");

  if (otherRevenues && otherRevenues.length > 0) {
    // 月別に集計
    const otherByMonth: Record<string, { note: number; myvision: number; other: number }> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of otherRevenues as any[]) {
      const period = (r.revenue_date as string).slice(0, 7).replace("-", "/");
      if (!otherByMonth[period]) otherByMonth[period] = { note: 0, myvision: 0, other: 0 };
      const amount = Number(r.amount) || 0;
      if (r.category === "note") otherByMonth[period].note += amount;
      else if (r.category === "myvision") otherByMonth[period].myvision += amount;
      else otherByMonth[period].other += amount;
    }

    // ThreeTierRevenueにマージ（既存の月にマージ + 新規月を追加）
    const existingPeriods = new Set(threeTierRevenue.map((t) => t.period));
    for (const [period, amounts] of Object.entries(otherByMonth)) {
      const existing = threeTierRevenue.find((t) => t.period === period);
      if (existing) {
        existing.content_revenue = amounts.note;
        existing.myvision_revenue = amounts.myvision;
        existing.other_misc_revenue = amounts.other;
        existing.confirmed_total += amounts.note + amounts.myvision + amounts.other;
        existing.projected_total += amounts.note + amounts.myvision + amounts.other;
      } else if (!existingPeriods.has(period)) {
        const total = amounts.note + amounts.myvision + amounts.other;
        threeTierRevenue.push({
          period,
          confirmed_school: 0, confirmed_school_kisotsu: 0, confirmed_school_shinsotsu: 0,
          confirmed_agent: 0, confirmed_subsidy: 0,
          confirmed_total: total,
          projected_agent: 0, projected_total: total,
          forecast_total: total, expected_ltv_total: 0,
          content_revenue: amounts.note,
          myvision_revenue: amounts.myvision,
          other_misc_revenue: amounts.other,
        });
      }
    }
    // 再ソート
    threeTierRevenue.sort((a, b) => a.period.localeCompare(b.period));
  }

  return (
    <DashboardClient
      totalCustomers={dashboardData.totalCustomers}
      closedCount={dashboardData.closedCount}
      funnelMetrics={funnelBySegment.all}
      funnelKisotsu={funnelBySegment.kisotsu}
      funnelShinsotsu={funnelBySegment.shinsotsu}
      revenueMetrics={revenueMetrics}
      threeTierRevenue={threeTierRevenue}
      insights={insights}
      channelTrends={channelTrends}
    />
  );
}
