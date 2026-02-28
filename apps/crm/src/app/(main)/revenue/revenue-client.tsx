"use client";

import { useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { ChannelTable } from "@/components/dashboard/channel-table";
import type {
  CustomerWithRelations,
  RevenueMetrics,
  FunnelMetrics,
  ChannelMetrics,
  ThreeTierRevenue,
  AgentRevenueSummary,
  QuarterlyForecast,
} from "@strategy-school/shared-db";

interface RevenueClientProps {
  customers: CustomerWithRelations[];
  revenueMetrics: RevenueMetrics[];
  funnelMetrics: FunnelMetrics[];
  channelMetrics: ChannelMetrics[];
  threeTierRevenue?: ThreeTierRevenue[];
  agentSummary?: AgentRevenueSummary;
  quarterlyForecast?: QuarterlyForecast[];
}

type TabId = "pl" | "quarterly" | "channel";

export function RevenueClient({
  customers,
  revenueMetrics,
  funnelMetrics,
  channelMetrics,
  threeTierRevenue,
  agentSummary,
  quarterlyForecast,
}: RevenueClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("pl");

  // 累計計算
  const customersWithRevenue = customers.filter((c) => c.contract?.confirmed_amount);
  const totalConfirmedRevenue = customersWithRevenue.reduce(
    (sum, c) => sum + (c.contract?.confirmed_amount || 0),
    0
  );
  const avgLTV =
    customersWithRevenue.length > 0
      ? totalConfirmedRevenue / customersWithRevenue.length
      : 0;

  // 3段階累計
  const totalThreeTier = threeTierRevenue?.reduce(
    (acc, t) => ({
      confirmed: acc.confirmed + t.confirmed_total,
      projected: acc.projected + t.projected_total,
      forecast: acc.forecast + t.forecast_total,
      agent_confirmed: acc.agent_confirmed + t.confirmed_agent,
      agent_projected: acc.agent_projected + t.projected_agent,
      school_kisotsu: acc.school_kisotsu + t.confirmed_school_kisotsu,
      school_shinsotsu: acc.school_shinsotsu + t.confirmed_school_shinsotsu,
    }),
    { confirmed: 0, projected: 0, forecast: 0, agent_confirmed: 0, agent_projected: 0, school_kisotsu: 0, school_shinsotsu: 0 }
  );

  const tabs: { id: TabId; label: string }[] = [
    { id: "pl", label: "P/L（損益概要）" },
    { id: "quarterly", label: "四半期予測" },
    { id: "channel", label: "チャネル分析" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">売上管理</h1>
        <p className="text-sm text-gray-500 mt-1">P/L・3段階売上・四半期予測・KPI分析</p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">累計確定売上</p>
          <p className="text-xl font-bold text-white mt-1">
            {formatCurrency(totalThreeTier?.confirmed ?? totalConfirmedRevenue)}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">見込み含む売上</p>
          <p className="text-xl font-bold text-amber-400 mt-1">
            {totalThreeTier ? formatCurrency(totalThreeTier.projected) : "-"}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">予測売上</p>
          <p className="text-xl font-bold text-red-400 mt-1">
            {totalThreeTier ? formatCurrency(totalThreeTier.forecast) : "-"}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">平均LTV</p>
          <p className="text-xl font-bold text-white mt-1">{formatCurrency(avgLTV)}</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">人材紹介見込</p>
          <p className="text-xl font-bold text-amber-400 mt-1">
            {agentSummary ? formatCurrency(agentSummary.total_projected_fee) : "-"}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">人材紹介確定</p>
          <p className="text-xl font-bold text-green-400 mt-1">
            {agentSummary ? formatCurrency(agentSummary.total_confirmed_fee) : "-"}
          </p>
        </div>
      </div>

      {/* 売上チャート */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">月別売上推移</h2>
          <RevenueChart data={revenueMetrics} threeTierData={threeTierRevenue} />
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">ファネル推移（申込→成約）</h2>
          <FunnelChart data={funnelMetrics} />
        </div>
      </div>

      {/* タブ切替 */}
      <div className="flex gap-1 border-b border-white/10 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === tab.id
                ? "border-brand text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* P/L 月別テーブル（3段階売上対応） */}
      {activeTab === "pl" && (
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">月別P/L概要</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">月</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">確定売上</th>
                  {threeTierRevenue && (
                    <>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-blue-400/70">既卒</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-cyan-400/70">新卒</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-amber-400/70">人材見込</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-amber-400/70">見込含む計</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-red-400/70">予測売上</th>
                    </>
                  )}
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">スクール</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">人材紹介</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">その他</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">申込</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">成約</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">成約率</th>
                </tr>
              </thead>
              <tbody>
                {revenueMetrics.map((r, i) => {
                  const f = funnelMetrics[i];
                  const t = threeTierRevenue?.find((tt) => tt.period === r.period);
                  return (
                    <tr key={r.period} className="border-b border-white/[0.08] hover:bg-white/5">
                      <td className="py-2 px-3 font-medium text-white">{r.period}</td>
                      <td className="py-2 px-3 text-right font-medium text-white">
                        {formatCurrency(t?.confirmed_total ?? r.confirmed_revenue)}
                      </td>
                      {threeTierRevenue && (
                        <>
                          <td className="py-2 px-3 text-right text-blue-400/80">
                            {t ? formatCurrency(t.confirmed_school_kisotsu) : "-"}
                          </td>
                          <td className="py-2 px-3 text-right text-cyan-400/80">
                            {t ? formatCurrency(t.confirmed_school_shinsotsu) : "-"}
                          </td>
                          <td className="py-2 px-3 text-right text-amber-400/80">
                            {t ? formatCurrency(t.projected_agent) : "-"}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-amber-400">
                            {t ? formatCurrency(t.projected_total) : "-"}
                          </td>
                          <td className="py-2 px-3 text-right text-red-400">
                            {t ? formatCurrency(t.forecast_total) : "-"}
                          </td>
                        </>
                      )}
                      <td className="py-2 px-3 text-right text-gray-300">{formatCurrency(r.school_revenue)}</td>
                      <td className="py-2 px-3 text-right text-gray-300">{formatCurrency(r.agent_revenue)}</td>
                      <td className="py-2 px-3 text-right text-gray-300">
                        {formatCurrency(r.content_revenue + r.other_revenue)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-300">{f?.applications || "-"}</td>
                      <td className="py-2 px-3 text-right text-gray-300">{f?.closed || "-"}</td>
                      <td className="py-2 px-3 text-right text-gray-300">
                        {f ? formatPercent(f.closing_rate) : "-"}
                      </td>
                    </tr>
                  );
                })}
                {/* 合計行 */}
                <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                  <td className="py-2 px-3 text-white">合計</td>
                  <td className="py-2 px-3 text-right text-white">
                    {formatCurrency(
                      totalThreeTier?.confirmed ??
                        revenueMetrics.reduce((s, r) => s + r.confirmed_revenue, 0)
                    )}
                  </td>
                  {threeTierRevenue && (
                    <>
                      <td className="py-2 px-3 text-right text-blue-400/80">
                        {totalThreeTier ? formatCurrency(totalThreeTier.school_kisotsu) : "-"}
                      </td>
                      <td className="py-2 px-3 text-right text-cyan-400/80">
                        {totalThreeTier ? formatCurrency(totalThreeTier.school_shinsotsu) : "-"}
                      </td>
                      <td className="py-2 px-3 text-right text-amber-400/80">
                        {totalThreeTier
                          ? formatCurrency(totalThreeTier.agent_projected)
                          : "-"}
                      </td>
                      <td className="py-2 px-3 text-right text-amber-400">
                        {totalThreeTier ? formatCurrency(totalThreeTier.projected) : "-"}
                      </td>
                      <td className="py-2 px-3 text-right text-red-400">
                        {totalThreeTier ? formatCurrency(totalThreeTier.forecast) : "-"}
                      </td>
                    </>
                  )}
                  <td className="py-2 px-3 text-right text-gray-300">
                    {formatCurrency(revenueMetrics.reduce((s, r) => s + r.school_revenue, 0))}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">
                    {formatCurrency(revenueMetrics.reduce((s, r) => s + r.agent_revenue, 0))}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">
                    {formatCurrency(
                      revenueMetrics.reduce((s, r) => s + r.content_revenue + r.other_revenue, 0)
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">
                    {funnelMetrics.reduce((s, f) => s + f.applications, 0)}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">
                    {funnelMetrics.reduce((s, f) => s + f.closed, 0)}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 四半期予測 */}
      {activeTab === "quarterly" && (
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">四半期売上予測</h2>
          {quarterlyForecast && quarterlyForecast.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">四半期</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">確定売上</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-amber-400/70">見込み含む</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-red-400/70">予測売上</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">スクール</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">人材紹介</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">申込</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">成約</th>
                  </tr>
                </thead>
                <tbody>
                  {quarterlyForecast.map((q) => (
                    <tr key={q.quarter} className="border-b border-white/[0.08] hover:bg-white/5">
                      <td className="py-2 px-3 font-medium text-white">{q.quarter}</td>
                      <td className="py-2 px-3 text-right font-medium text-white">
                        {formatCurrency(q.confirmed_revenue)}
                      </td>
                      <td className="py-2 px-3 text-right text-amber-400">
                        {formatCurrency(q.projected_revenue)}
                      </td>
                      <td className="py-2 px-3 text-right text-red-400">
                        {formatCurrency(q.forecast_revenue)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-300">
                        {formatCurrency(q.school_revenue)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-300">
                        {formatCurrency(q.agent_revenue)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-300">{q.applications}</td>
                      <td className="py-2 px-3 text-right text-gray-300">{q.closings}</td>
                    </tr>
                  ))}
                  {/* 合計行 */}
                  <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                    <td className="py-2 px-3 text-white">合計</td>
                    <td className="py-2 px-3 text-right text-white">
                      {formatCurrency(quarterlyForecast.reduce((s, q) => s + q.confirmed_revenue, 0))}
                    </td>
                    <td className="py-2 px-3 text-right text-amber-400">
                      {formatCurrency(quarterlyForecast.reduce((s, q) => s + q.projected_revenue, 0))}
                    </td>
                    <td className="py-2 px-3 text-right text-red-400">
                      {formatCurrency(quarterlyForecast.reduce((s, q) => s + q.forecast_revenue, 0))}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300">
                      {formatCurrency(quarterlyForecast.reduce((s, q) => s + q.school_revenue, 0))}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300">
                      {formatCurrency(quarterlyForecast.reduce((s, q) => s + q.agent_revenue, 0))}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300">
                      {quarterlyForecast.reduce((s, q) => s + q.applications, 0)}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300">
                      {quarterlyForecast.reduce((s, q) => s + q.closings, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">四半期予測データがありません（モックモードでは非表示）</p>
          )}
        </div>
      )}

      {/* チャネル分析 */}
      {activeTab === "channel" && (
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">チャネル別実績</h2>
          <ChannelTable data={channelMetrics} />
        </div>
      )}
    </div>
  );
}
