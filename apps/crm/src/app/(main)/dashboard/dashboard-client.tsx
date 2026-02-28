"use client";

import { formatCurrency, formatPercent } from "@/lib/utils";
import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { ChannelTable } from "@/components/dashboard/channel-table";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RecentCustomers } from "@/components/dashboard/recent-customers";
import type {
  CustomerWithRelations,
  FunnelMetrics,
  RevenueMetrics,
  ChannelMetrics,
  ThreeTierRevenue,
  AgentRevenueSummary,
} from "@strategy-school/shared-db";

interface DashboardClientProps {
  totalCustomers: number;
  closedCount: number;
  activeDeals: number;
  customers: CustomerWithRelations[];
  funnelMetrics: FunnelMetrics[];
  revenueMetrics: RevenueMetrics[];
  channelMetrics: ChannelMetrics[];
  threeTierRevenue?: ThreeTierRevenue[];
  agentSummary?: AgentRevenueSummary;
}

export function DashboardClient({
  totalCustomers,
  closedCount,
  activeDeals,
  customers,
  funnelMetrics,
  revenueMetrics,
  channelMetrics,
  threeTierRevenue,
  agentSummary,
}: DashboardClientProps) {
  const latestFunnel = funnelMetrics[funnelMetrics.length - 1];
  const latestRevenue = revenueMetrics[revenueMetrics.length - 1];

  const safeFunnel: FunnelMetrics = latestFunnel || {
    period: "-",
    applications: 0,
    scheduled: 0,
    conducted: 0,
    closed: 0,
    scheduling_rate: 0,
    conduct_rate: 0,
    closing_rate: 0,
  };
  const safeRevenue: RevenueMetrics = latestRevenue || {
    period: "-",
    confirmed_revenue: 0,
    projected_revenue: 0,
    school_revenue: 0,
    agent_revenue: 0,
    content_revenue: 0,
    other_revenue: 0,
  };

  // 3段階売上の最新月
  const latestThreeTier = threeTierRevenue?.[threeTierRevenue.length - 1];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">
            営業・売上・KPIの概況
          </p>
        </div>
        <div className="text-sm text-gray-500">
          最終更新: {new Date().toLocaleDateString("ja-JP")}
        </div>
      </div>

      <KpiCards
        totalCustomers={totalCustomers}
        closedCount={closedCount}
        activeDeals={activeDeals}
        latestRevenue={safeRevenue}
        latestFunnel={safeFunnel}
        agentSummary={agentSummary}
      />

      {/* エージェント売上サマリー */}
      {agentSummary && agentSummary.active_agent_count > 0 && (
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">人材紹介 売上概況</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">見込み合計</p>
              <p className="text-xl font-bold text-amber-400">
                {formatCurrency(agentSummary.total_projected_fee)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                受講中 {agentSummary.in_progress_count}名
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">確定合計</p>
              <p className="text-xl font-bold text-green-400">
                {formatCurrency(agentSummary.total_confirmed_fee)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                確定 {agentSummary.confirmed_count}名
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">平均想定年収</p>
              <p className="text-xl font-bold text-white">
                {agentSummary.avg_expected_salary > 0
                  ? formatCurrency(agentSummary.avg_expected_salary)
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">平均紹介手数料率</p>
              <p className="text-xl font-bold text-white">
                {agentSummary.avg_referral_fee_rate > 0
                  ? formatPercent(agentSummary.avg_referral_fee_rate)
                  : "-"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">売上推移</h2>
          <RevenueChart data={revenueMetrics} threeTierData={threeTierRevenue} />
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">ファネル推移</h2>
          <FunnelChart data={funnelMetrics} />
        </div>
      </div>

      {/* 3段階売上サマリー（最新月） */}
      {latestThreeTier && (
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            最新月の3段階売上（{latestThreeTier.period}）
          </h2>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-3 h-3 rounded-full bg-blue-500 mx-auto mb-2" />
              <p className="text-xs text-gray-500 mb-1">Tier 1: 確定売上</p>
              <p className="text-2xl font-bold text-white">
                {formatCurrency(latestThreeTier.confirmed_total)}
              </p>
              <div className="mt-2 text-xs text-gray-400 space-y-0.5">
                <p>スクール: {formatCurrency(latestThreeTier.confirmed_school)}</p>
                <p>人材確定: {formatCurrency(latestThreeTier.confirmed_agent)}</p>
                <p>補助金: {formatCurrency(latestThreeTier.confirmed_subsidy)}</p>
              </div>
            </div>
            <div className="text-center">
              <div className="w-3 h-3 rounded-full bg-amber-500 mx-auto mb-2" />
              <p className="text-xs text-gray-500 mb-1">Tier 2: 見込み含む</p>
              <p className="text-2xl font-bold text-amber-400">
                {formatCurrency(latestThreeTier.projected_total)}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                +人材見込: {formatCurrency(latestThreeTier.projected_agent)}
              </p>
            </div>
            <div className="text-center">
              <div className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-2" />
              <p className="text-xs text-gray-500 mb-1">Tier 3: 予測売上</p>
              <p className="text-2xl font-bold text-red-400">
                {formatCurrency(latestThreeTier.forecast_total)}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                パイプライン成約率ベース
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">チャネル別実績</h2>
          <ChannelTable data={channelMetrics} />
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">最近の顧客</h2>
          <RecentCustomers customers={customers.slice(0, 5)} />
        </div>
      </div>
    </div>
  );
}
