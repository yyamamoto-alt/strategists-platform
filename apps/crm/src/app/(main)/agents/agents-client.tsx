"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { calcExpectedReferralFee, getOfferRankRate, OFFER_RANK_META, isAgentCustomer, AGENT_CATEGORIES } from "@/lib/calc-fields";
import type { CustomerWithRelations, AgentRevenueSummary } from "@strategy-school/shared-db";

interface AgentsClientProps {
  customers: CustomerWithRelations[];
  agentSummary?: AgentRevenueSummary;
}

const REFERRAL_OPTIONS = ["フル利用", "一部利用", "自社", "該当", "非対象", "なし", "スクールのみ"] as const;
const JOB_STATUS_OPTIONS = ["活動中", "活動予定", "中断", "内定（別経路）", "転職成功", "終了"] as const;

/** 内定ランクの色バッジ */
function RankBadge({ rank }: { rank: string | null | undefined }) {
  const r = rank || "B";
  const meta = OFFER_RANK_META[r];
  if (!meta) return <span className="text-xs text-gray-500">-</span>;
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${meta.color} ${meta.bgColor}`}>
      {r}
    </span>
  );
}

export function AgentsClient({ customers, agentSummary }: AgentsClientProps) {
  const [overrides, setOverrides] = useState<Record<string, { referral_category?: string; job_search_status?: string }>>({});

  const agentCustomers = customers
    .filter((c) => c.agent)
    .map((c) => ({ ...c, agent: c.agent! }));

  // agent_recordsがある顧客を全員表示（非対象を除外）
  const enrolled = agentCustomers.filter((c) => {
    const ov = overrides[c.id];
    const cat = ov?.referral_category ?? c.contract?.referral_category;
    // 明示的に「非対象」「なし」「スクールのみ」に設定されている場合のみ除外
    if (cat === "非対象" || cat === "なし" || cat === "スクールのみ") return false;
    return true;
  });
  const getJobStatus = (c: CustomerWithRelations) => overrides[c.id]?.job_search_status ?? c.agent?.job_search_status ?? null;
  const getReferralCat = (c: CustomerWithRelations) => overrides[c.id]?.referral_category ?? c.contract?.referral_category ?? null;

  const activeSearch = enrolled.filter((c) => getJobStatus(c) === "活動中");
  const planned = enrolled.filter((c) => getJobStatus(c) === "活動予定");
  const ended = enrolled.filter((c) => getJobStatus(c) === "終了");
  const confirmed = agentCustomers.filter(
    (c) => c.agent.placement_confirmed === "確定"
  );

  const statusColor = (status: string | null) => {
    switch (status) {
      case "活動中": return "bg-brand-muted text-brand";
      case "活動予定": return "bg-cyan-500/15 text-cyan-400";
      case "転職成功": return "bg-emerald-500/15 text-emerald-400";
      case "内定（別経路）": return "bg-purple-500/15 text-purple-400";
      case "中断": return "bg-gray-900/20 text-gray-400";
      case "終了": return "bg-gray-900/20 text-gray-400";
      default: return "bg-white/10 text-gray-300";
    }
  };

  const handleReferralChange = useCallback(async (customerId: string, value: string) => {
    const newVal = value || null;
    setOverrides((prev) => ({ ...prev, [customerId]: { ...prev[customerId], referral_category: value } }));
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract: { referral_category: newVal } }),
      });
      if (!res.ok) {
        setOverrides((prev) => { const next = { ...prev }; delete next[customerId]?.referral_category; return { ...next }; });
        alert("人材紹介区分の更新に失敗しました");
      }
    } catch {
      setOverrides((prev) => { const next = { ...prev }; delete next[customerId]?.referral_category; return { ...next }; });
      alert("人材紹介区分の更新に失敗しました");
    }
  }, []);

  const handleJobStatusChange = useCallback(async (customerId: string, value: string) => {
    const newVal = value || null;
    setOverrides((prev) => ({ ...prev, [customerId]: { ...prev[customerId], job_search_status: value } }));
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: { job_search_status: newVal } }),
      });
      if (!res.ok) {
        setOverrides((prev) => { const next = { ...prev }; delete next[customerId]?.job_search_status; return { ...next }; });
        alert("活動状況の更新に失敗しました");
      }
    } catch {
      setOverrides((prev) => { const next = { ...prev }; delete next[customerId]?.job_search_status; return { ...next }; });
      alert("活動状況の更新に失敗しました");
    }
  }, []);

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
          <p className="text-xs text-gray-500">活動予定</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1">{planned.length}名</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">終了</p>
          <p className="text-2xl font-bold text-gray-400 mt-1">{ended.length}名</p>
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
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">人材紹介区分</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">活動状況</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">確定</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500">内定ランク</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500">AI内定確度</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">想定年収</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">紹介報酬期待値</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">外部エージェント</th>
              </tr>
            </thead>
            <tbody>
              {enrolled.map((c) => {
                const fee = calcExpectedReferralFee(c);
                const refCat = getReferralCat(c);
                const jobStatus = getJobStatus(c);
                return (
                  <tr key={c.id} className="border-b border-white/[0.08] hover:bg-white/5">
                    <td className="py-3 px-4">
                      <Link href={`/customers/${c.id}`} className="font-medium text-sm text-white hover:text-brand">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2 px-4">
                      <select
                        value={refCat || ""}
                        onChange={(e) => handleReferralChange(c.id, e.target.value)}
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer"
                      >
                        <option value="">未設定</option>
                        {REFERRAL_OPTIONS.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-4">
                      <select
                        value={jobStatus || ""}
                        onChange={(e) => handleJobStatusChange(c.id, e.target.value)}
                        className={`border border-white/10 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer ${
                          jobStatus === "活動中" ? "bg-brand/20 text-brand border-brand/30" :
                          jobStatus === "活動予定" ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" :
                          jobStatus === "転職成功" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                          jobStatus === "内定（別経路）" ? "bg-purple-500/15 text-purple-400 border-purple-500/30" :
                          (jobStatus === "中断" || jobStatus === "終了") ? "bg-gray-800 text-gray-400 border-gray-700" :
                          "bg-white/5 text-gray-500"
                        }`}
                      >
                        <option value="">未設定</option>
                        {JOB_STATUS_OPTIONS.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
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
                    <td className="py-3 px-4 text-center">
                      <RankBadge rank={c.agent.offer_rank} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      {c.agent.ai_offer_probability != null ? (
                        <span className={`text-xs font-medium ${c.agent.ai_offer_probability >= 60 ? "text-emerald-400" : c.agent.ai_offer_probability >= 30 ? "text-amber-400" : "text-gray-400"}`}>
                          {c.agent.ai_offer_probability}%
                        </span>
                      ) : <span className="text-gray-600 text-xs">-</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-300">
                      {c.agent.offer_salary ? formatCurrency(c.agent.offer_salary) : "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-medium">
                      <span className={fee > 0 ? "text-amber-400" : "text-gray-500"}>
                        {fee > 0 ? formatCurrency(fee) : "-"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400">{c.agent.external_agents || "-"}</td>
                  </tr>
                );
              })}
              {enrolled.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
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
