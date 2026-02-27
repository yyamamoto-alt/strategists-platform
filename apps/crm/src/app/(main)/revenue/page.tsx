"use client";

import { mockRevenueMetrics, mockFunnelMetrics, mockChannelMetrics, mockCustomers } from "@/lib/mock-data";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { ChannelTable } from "@/components/dashboard/channel-table";

export default function RevenuePage() {
  // LTV計算
  const customersWithRevenue = mockCustomers.filter((c) => c.contract?.confirmed_amount);
  const totalRevenue = customersWithRevenue.reduce((sum, c) => sum + (c.contract?.confirmed_amount || 0), 0);
  const avgLTV = customersWithRevenue.length > 0 ? totalRevenue / customersWithRevenue.length : 0;
  const avgSchoolPrice = 220000;

  // 人材紹介併用率
  const agentEnrolled = mockCustomers.filter((c) => c.agent?.agent_service_enrolled).length;
  const agentRate = customersWithRevenue.length > 0 ? agentEnrolled / customersWithRevenue.length : 0;

  // 累計売上推移
  let cumulative = 0;
  const cumulativeData = mockRevenueMetrics.map((r) => {
    cumulative += r.confirmed_revenue;
    return { ...r, cumulative };
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">売上管理</h1>
        <p className="text-sm text-gray-500 mt-1">P/L・売上推移・KPI分析</p>
      </div>

      {/* KPIサマリ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">累計確定売上</p>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(cumulative)}</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">平均LTV</p>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(avgLTV)}</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">スクール平均単価</p>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(avgSchoolPrice)}</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">人材紹介併用率</p>
          <p className="text-2xl font-bold text-white mt-1">{formatPercent(agentRate)}</p>
        </div>
      </div>

      {/* 売上チャート */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">月別売上推移（セグメント別）</h2>
          <RevenueChart data={mockRevenueMetrics} />
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">ファネル推移（申込→成約）</h2>
          <FunnelChart data={mockFunnelMetrics} />
        </div>
      </div>

      {/* 月別P/Lテーブル */}
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">月別P/L概要</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">月</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">確定売上</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">見込売上</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">スクール</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">人材紹介</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">コンテンツ</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">その他</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">申込</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">成約</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">成約率</th>
              </tr>
            </thead>
            <tbody>
              {mockRevenueMetrics.map((r, i) => {
                const f = mockFunnelMetrics[i];
                return (
                  <tr key={r.period} className="border-b border-white/[0.08] hover:bg-white/5">
                    <td className="py-2 px-3 font-medium text-white">{r.period}</td>
                    <td className="py-2 px-3 text-right font-medium text-white">{formatCurrency(r.confirmed_revenue)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{formatCurrency(r.projected_revenue)}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{formatCurrency(r.school_revenue)}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{formatCurrency(r.agent_revenue)}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{formatCurrency(r.content_revenue)}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{formatCurrency(r.other_revenue)}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{f?.applications || "-"}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{f?.closed || "-"}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{f ? formatPercent(f.closing_rate) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* チャネル別 */}
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">チャネル別実績</h2>
        <ChannelTable data={mockChannelMetrics} />
      </div>
    </div>
  );
}
