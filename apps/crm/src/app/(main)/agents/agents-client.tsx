"use client";

import Link from "next/link";
import { formatDate, formatCurrency, formatPercent } from "@/lib/utils";
import type { CustomerWithRelations, AgentRevenueSummary } from "@strategy-school/shared-db";

interface AgentsClientProps {
  customers: CustomerWithRelations[];
  agentSummary?: AgentRevenueSummary;
}

/** 顧客のエージェント紹介報酬期待値を算出 */
function calcExpectedFee(c: CustomerWithRelations): number {
  const a = c.agent;
  if (!a) return 0;
  if (a.expected_referral_fee && a.expected_referral_fee > 0) {
    return a.expected_referral_fee;
  }
  const salary = a.offer_salary || 0;
  const hireRate = a.hire_rate ?? 0.6;
  const offerProb = a.offer_probability ?? 0.3;
  const feeRate = a.referral_fee_rate ?? 0.3;
  const margin = a.margin ?? 1.0;
  return salary * hireRate * offerProb * feeRate * margin;
}

export function AgentsClient({ customers, agentSummary }: AgentsClientProps) {
  const agentCustomers = customers
    .filter((c) => c.agent)
    .map((c) => ({ ...c, agent: c.agent! }));

  const enrolled = agentCustomers.filter((c) => {
    if (c.agent.agent_service_enrolled) return true;
    if (c.agent.expected_referral_fee && c.agent.expected_referral_fee > 0) return true;
    if (c.agent.offer_salary && c.agent.offer_salary > 0) return true;
    return false;
  });
  const activeSearch = agentCustomers.filter((c) => c.agent.job_search_status === "活動中");
  const placed = agentCustomers.filter(
    (c) => c.agent.job_search_status === "入社済" || c.agent.job_search_status === "内定"
  );
  const confirmed = agentCustomers.filter(
    (c) => c.agent.placement_confirmed === "確定"
  );

  const statusColor = (status: string) => {
    switch (status) {
      case "活動中": return "bg-brand-muted text-brand";
      case "内定": return "bg-green-900/20 text-green-400";
      case "入社済": return "bg-emerald-900/20 text-emerald-400";
      case "休止": return "bg-orange-900/20 text-orange-400";
      case "未開始": return "bg-white/10 text-gray-300";
      default: return "bg-white/10 text-gray-300";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">エージェント・転職支援</h1>
        <p className="text-sm text-gray-500 mt-1">人材紹介サービスの利用状況・転職活動進捗・売上見込</p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">エージェント利用者</p>
          <p className="text-2xl font-bold text-white mt-1">{enrolled.length}名</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">転職活動中</p>
          <p className="text-2xl font-bold text-white mt-1">{activeSearch.length}名</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">内定・入社済</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{placed.length}名</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">確定済</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{confirmed.length}名</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">見込売上合計</p>
          <p className="text-xl font-bold text-amber-400 mt-1">
            {agentSummary ? formatCurrency(agentSummary.total_projected_fee) : "-"}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">確定売上合計</p>
          <p className="text-xl font-bold text-green-400 mt-1">
            {agentSummary ? formatCurrency(agentSummary.total_confirmed_fee) : "-"}
          </p>
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-elevated border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">顧客</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ステータス</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">確定</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">想定年収</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">紹介報酬期待値</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">手数料率</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">プラン</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">選考状況</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">外部エージェント</th>
              </tr>
            </thead>
            <tbody>
              {enrolled.map((c) => {
                const fee = calcExpectedFee(c);
                return (
                  <tr key={c.id} className="border-b border-white/[0.08] hover:bg-white/5">
                    <td className="py-3 px-4">
                      <Link href={`/customers/${c.id}`} className="font-medium text-sm text-white hover:text-brand">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(c.agent.job_search_status)}`}>
                        {c.agent.job_search_status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {c.agent.placement_confirmed === "確定" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/20 text-emerald-400">
                          確定
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">見込み</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-300">
                      {c.agent.offer_salary ? formatCurrency(c.agent.offer_salary) : "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium">
                      <span className={fee > 0 ? "text-amber-400" : "text-gray-500"}>
                        {fee > 0 ? formatCurrency(fee) : "-"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-300">
                      {c.agent.referral_fee_rate ? `${(c.agent.referral_fee_rate * 100).toFixed(0)}%` : "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400 max-w-[200px] truncate">
                      {c.agent.agent_plan || "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400 max-w-[200px] truncate">
                      {c.agent.selection_status || "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400">{c.agent.external_agents || "-"}</td>
                  </tr>
                );
              })}
              {enrolled.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500">
                    エージェント利用者がいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
