import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type {
  FunnelMetrics,
  RevenueMetrics,
  ChannelMetrics,
  CustomerWithRelations,
} from "@strategy-school/shared-db";

// パイプラインステージ別の顧客数からファネルメトリクスを算出
export function computeFunnelMetrics(
  customers: CustomerWithRelations[]
): FunnelMetrics[] {
  // 月別に集計
  const byMonth = new Map<
    string,
    { applications: number; scheduled: number; conducted: number; closed: number }
  >();

  for (const c of customers) {
    const date = c.application_date;
    if (!date) continue;
    const period = date.slice(0, 7).replace("-", "/"); // "2025-08" -> "2025/08"

    if (!byMonth.has(period)) {
      byMonth.set(period, { applications: 0, scheduled: 0, conducted: 0, closed: 0 });
    }
    const m = byMonth.get(period)!;
    m.applications++;

    if (c.pipeline) {
      const s = c.pipeline.stage;
      if (s !== "問い合わせ") m.scheduled++;
      if (
        s === "面談実施" ||
        s === "提案中" ||
        s === "成約" ||
        s === "入金済"
      ) {
        m.conducted++;
      }
      if (s === "成約" || s === "入金済") {
        m.closed++;
      }
    }
  }

  // ソートして返す
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, m]) => ({
      period,
      ...m,
      scheduling_rate: m.applications > 0 ? m.scheduled / m.applications : 0,
      conduct_rate: m.scheduled > 0 ? m.conducted / m.scheduled : 0,
      closing_rate: m.conducted > 0 ? m.closed / m.conducted : 0,
    }));
}

// 契約データから月別売上メトリクスを算出
export function computeRevenueMetrics(
  customers: CustomerWithRelations[]
): RevenueMetrics[] {
  const byMonth = new Map<
    string,
    {
      confirmed_revenue: number;
      projected_revenue: number;
      school_revenue: number;
      agent_revenue: number;
      content_revenue: number;
      other_revenue: number;
    }
  >();

  for (const c of customers) {
    const paymentDate =
      c.contract?.payment_date || c.pipeline?.closing_date || c.application_date;
    if (!paymentDate) continue;
    const period = paymentDate.slice(0, 7).replace("-", "/");

    if (!byMonth.has(period)) {
      byMonth.set(period, {
        confirmed_revenue: 0,
        projected_revenue: 0,
        school_revenue: 0,
        agent_revenue: 0,
        content_revenue: 0,
        other_revenue: 0,
      });
    }
    const m = byMonth.get(period)!;
    const amount = c.contract?.confirmed_amount || 0;

    if (c.contract?.billing_status === "入金済") {
      m.confirmed_revenue += amount;
    }
    m.projected_revenue += c.pipeline?.projected_amount || amount;

    // セグメント分類
    if (c.agent?.agent_service_enrolled) {
      m.agent_revenue += amount * 0.3; // エージェント収益部分の概算
      m.school_revenue += amount * 0.7;
    } else {
      m.school_revenue += amount;
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, m]) => ({ period, ...m }));
}

// utm_source 別のチャネルメトリクスを算出
export function computeChannelMetrics(
  customers: CustomerWithRelations[]
): ChannelMetrics[] {
  const byChannel = new Map<
    string,
    { applications: number; closings: number; revenue: number }
  >();

  for (const c of customers) {
    const channel = c.utm_source || "その他";

    if (!byChannel.has(channel)) {
      byChannel.set(channel, { applications: 0, closings: 0, revenue: 0 });
    }
    const m = byChannel.get(channel)!;
    m.applications++;

    if (c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済") {
      m.closings++;
      m.revenue += c.contract?.confirmed_amount || 0;
    }
  }

  return Array.from(byChannel.entries())
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .map(([channel, m]) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel: channel as any,
      ...m,
      cpa: 0,
      ltv: m.closings > 0 ? Math.round(m.revenue / m.closings) : 0,
    }));
}

// Supabase から直接ダッシュボードデータを集計取得
export async function fetchDashboardData() {
  const supabase = createServiceClient();

  // 基本顧客数
  const { count: totalCustomers } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true });

  // ステージ別カウント
  const { data: pipelineData } = await supabase
    .from("sales_pipeline")
    .select("stage") as { data: { stage: string }[] | null };

  const stageCounts: Record<string, number> = {};
  for (const p of pipelineData || []) {
    stageCounts[p.stage] = (stageCounts[p.stage] || 0) + 1;
  }

  const closedCount =
    (stageCounts["成約"] || 0) + (stageCounts["入金済"] || 0);
  const lostCount = stageCounts["失注"] || 0;
  const activeDeals =
    (totalCustomers || 0) - closedCount - lostCount;

  return {
    totalCustomers: totalCustomers || 0,
    closedCount,
    activeDeals,
    stageCounts,
  };
}
