"use client";

import { formatCurrency, formatPercent } from "@/lib/utils";
import type { FunnelMetrics, RevenueMetrics, AgentRevenueSummary } from "@/types/database";

interface KpiCardsProps {
  totalCustomers: number;
  closedCount: number;
  activeDeals: number;
  latestRevenue: RevenueMetrics;
  latestFunnel: FunnelMetrics;
  agentSummary?: AgentRevenueSummary;
}

export function KpiCards({
  totalCustomers,
  closedCount,
  activeDeals,
  latestRevenue,
  latestFunnel,
  agentSummary,
}: KpiCardsProps) {
  const cards = [
    {
      title: "総顧客数",
      value: totalCustomers.toString(),
      subtitle: `成約: ${closedCount}件`,
      color: "bg-blue-500",
    },
    {
      title: "今月確定売上",
      value: formatCurrency(latestRevenue.confirmed_revenue),
      subtitle: `見込: ${formatCurrency(latestRevenue.projected_revenue)}`,
      color: "bg-green-500",
    },
    {
      title: "今月成約率",
      value: formatPercent(latestFunnel.closing_rate),
      subtitle: `成約: ${latestFunnel.closed}件 / 実施: ${latestFunnel.conducted}件`,
      color: "bg-purple-500",
    },
    {
      title: "アクティブ商談",
      value: activeDeals.toString(),
      subtitle: "進行中の営業案件",
      color: "bg-orange-500",
    },
    {
      title: "人材紹介見込",
      value: agentSummary
        ? formatCurrency(agentSummary.total_projected_fee)
        : "-",
      subtitle: agentSummary
        ? `対象: ${agentSummary.active_agent_count}名`
        : "データなし",
      color: "bg-emerald-500",
    },
    {
      title: "面談実施率",
      value: formatPercent(latestFunnel.conduct_rate),
      subtitle: `実施: ${latestFunnel.conducted}件 / 確定: ${latestFunnel.scheduled}件`,
      color: "bg-pink-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${card.color}`} />
            <p className="text-xs text-gray-500 font-medium">{card.title}</p>
          </div>
          <p className="text-xl font-bold text-white">{card.value}</p>
          <p className="text-xs text-gray-400 mt-1">{card.subtitle}</p>
        </div>
      ))}
    </div>
  );
}
