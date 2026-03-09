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
import { fetchNoteSalesByMonth } from "@/lib/data/note-sales";
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

  // note売上: ハードコード過去分 + ordersテーブル（2025/8〜）
  const noteSalesByMonth = await fetchNoteSalesByMonth();

  // myvision/other: 引き続きother_revenuesテーブルから取得
  const { data: otherRevenues } = await db
    .from("other_revenues")
    .select("category, amount, revenue_date")
    .neq("category", "note");

  const otherByMonth: Record<string, { note: number; myvision: number; other: number }> = {};

  // note売上をマージ
  for (const [period, amount] of Object.entries(noteSalesByMonth)) {
    if (!otherByMonth[period]) otherByMonth[period] = { note: 0, myvision: 0, other: 0 };
    otherByMonth[period].note += amount;
  }

  // myvision/otherをマージ
  if (otherRevenues && otherRevenues.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of otherRevenues as any[]) {
      let period = (r.revenue_date as string).slice(0, 7).replace("-", "/");
      // MyVision受託は入金月ではなく役務提供月（-1ヶ月）に計上
      if (r.category === "myvision") {
        const [y, m] = period.split("/").map(Number);
        const d = new Date(y, m - 2, 1); // m-1 → 0-indexed = m-2
        period = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      if (!otherByMonth[period]) otherByMonth[period] = { note: 0, myvision: 0, other: 0 };
      const amount = Number(r.amount) || 0;
      if (r.category === "myvision") otherByMonth[period].myvision += amount;
      else otherByMonth[period].other += amount;
    }
  }

  // ThreeTierRevenueにマージ（既存の月にマージ + 新規月を追加）
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
  // 再ソート
  threeTierRevenue.sort((a, b) => a.period.localeCompare(b.period));

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
