"use client";

import Link from "next/link";
import { mockCustomers } from "@/lib/mock-data";
import { formatDate, formatCurrency } from "@/lib/utils";

export default function AgentsPage() {
  const agentCustomersRaw = mockCustomers.filter((c) => c.agent);
  const agentCustomers = agentCustomersRaw.map((c) => ({
    ...c,
    agent: c.agent!,
  }));

  const enrolled = agentCustomers.filter((c) => c.agent.agent_service_enrolled);
  const activeSearch = agentCustomers.filter((c) => c.agent.job_search_status === "活動中");
  const placed = agentCustomers.filter(
    (c) => c.agent.job_search_status === "入社済" || c.agent.job_search_status === "内定"
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
        <p className="text-sm text-gray-500 mt-1">人材紹介サービスの利用状況・転職活動進捗</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <p className="text-2xl font-bold text-white mt-1">{placed.length}名</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">平均紹介手数料率</p>
          <p className="text-2xl font-bold text-white mt-1">
            {enrolled.length > 0
              ? `${Math.round(
                  (enrolled.reduce((sum, c) => sum + (c.agent.referral_fee_rate || 0), 0) /
                    enrolled.length) *
                    100
                )}%`
              : "-"}
          </p>
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-elevated border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">顧客</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ステータス</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">プラン</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">選考状況</th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500">受験数</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">手数料率</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">外部エージェント</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">レベルアップ</th>
            </tr>
          </thead>
          <tbody>
            {agentCustomers.map((c) => (
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
                <td className="py-3 px-4 text-sm text-gray-400 max-w-[200px] truncate">
                  {c.agent.agent_plan || "-"}
                </td>
                <td className="py-3 px-4 text-sm text-gray-400 max-w-[200px] truncate">
                  {c.agent.selection_status || "-"}
                </td>
                <td className="py-3 px-4 text-sm text-center text-gray-300">{c.agent.exam_count}</td>
                <td className="py-3 px-4 text-sm text-gray-300">
                  {c.agent.referral_fee_rate ? `${(c.agent.referral_fee_rate * 100).toFixed(0)}%` : "-"}
                </td>
                <td className="py-3 px-4 text-sm text-gray-400">{c.agent.external_agents || "-"}</td>
                <td className="py-3 px-4 text-sm text-gray-400 max-w-[200px] truncate">
                  {c.agent.level_up_confirmed || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
