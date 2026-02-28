"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  formatDate,
  formatCurrency,
  formatPercent,
  getStageColor,
  getAttributeColor,
  getDealStatusColor,
} from "@/lib/utils";
import type { CustomerWithRelations } from "@strategy-school/shared-db";
import {
  calcClosingProbability,
  calcExpectedLTV,
  calcRemainingSessions,
  calcProgressStatus,
  calcAgentProjectedRevenue,
  calcExpectedReferralFee,
  isAgentCustomer,
  isAgentConfirmed,
  getSubsidyAmount,
} from "@/lib/calc-fields";
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from "@/components/spreadsheet-table";

interface CustomersClientProps {
  customers: CustomerWithRelations[];
}

export function CustomersClient({ customers }: CustomersClientProps) {
  const [search, setSearch] = useState("");
  const [attributeFilter, setAttributeFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("application_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"design" | "spreadsheet">("design");

  // 属性・ステージフィルタは両ビュー共通
  const baseFiltered = useMemo(() => {
    let result = [...customers];
    if (attributeFilter) {
      result = result.filter((c) => c.attribute === attributeFilter);
    }
    if (stageFilter) {
      result = result.filter((c) => c.pipeline?.stage === stageFilter);
    }
    return result;
  }, [customers, attributeFilter, stageFilter]);

  // デザインビュー用: テキスト検索 + ソート
  const filtered = useMemo(() => {
    let result = [...baseFiltered];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.university?.toLowerCase().includes(q) ||
          c.career_history?.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortBy) {
        case "application_date":
          aVal = a.application_date || "";
          bVal = b.application_date || "";
          break;
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "amount":
          aVal = a.contract?.confirmed_amount || 0;
          bVal = b.contract?.confirmed_amount || 0;
          break;
      }

      if (sortDir === "asc") return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

    return result;
  }, [baseFiltered, search, sortBy, sortDir]);

  // スプレッドシートビュー用カラム定義
  const spreadsheetColumns: SpreadsheetColumn<CustomerWithRelations>[] = useMemo(
    () => [
      {
        key: "name",
        label: "顧客名",
        width: 160,
        render: (c) => (
          <Link href={`/customers/${c.id}`} className="text-brand hover:underline">
            {c.name}
          </Link>
        ),
        sortValue: (c) => c.name,
      },
      { key: "attribute", label: "属性", width: 70, render: (c) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(c.attribute)}`}>{c.attribute}</span>
      ), sortValue: (c) => c.attribute },
      { key: "application_date", label: "申込日", width: 100, render: (c) => formatDate(c.application_date), sortValue: (c) => c.application_date || "" },
      { key: "utm_source", label: "utm_source", width: 100, render: (c) => c.utm_source || "-", sortValue: (c) => c.utm_source || "" },
      { key: "stage", label: "ステージ", width: 90, render: (c) => c.pipeline ? (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(c.pipeline.stage)}`}>{c.pipeline.stage}</span>
      ) : "-", sortValue: (c) => c.pipeline?.stage || "" },
      { key: "deal_status", label: "商談状況", width: 90, render: (c) => c.pipeline ? (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDealStatusColor(c.pipeline.deal_status)}`}>{c.pipeline.deal_status}</span>
      ) : "-", sortValue: (c) => c.pipeline?.deal_status || "" },
      { key: "closing_prob", label: "成約見込", width: 80, align: "right" as const, render: (c) => formatPercent(calcClosingProbability(c)), sortValue: (c) => calcClosingProbability(c) },
      { key: "expected_ltv", label: "見込LTV", width: 110, align: "right" as const, render: (c) => { const v = calcExpectedLTV(c); return v > 0 ? formatCurrency(v) : "-"; }, sortValue: (c) => calcExpectedLTV(c) },
      { key: "confirmed", label: "確定売上", width: 110, align: "right" as const, render: (c) => c.contract?.confirmed_amount ? formatCurrency(c.contract.confirmed_amount) : "-", sortValue: (c) => c.contract?.confirmed_amount || 0 },
      { key: "contract_amount", label: "契約金額", width: 110, align: "right" as const, render: (c) => c.contract?.contract_amount ? formatCurrency(c.contract.contract_amount) : "-", sortValue: (c) => c.contract?.contract_amount || 0 },
      { key: "plan", label: "プラン", width: 160, render: (c) => c.contract?.plan_name || "-" },
      { key: "mentor", label: "メンター", width: 100, render: (c) => c.learning?.mentor_name || "-" },
      { key: "start_date", label: "開始日", width: 100, render: (c) => formatDate(c.learning?.coaching_start_date ?? null) },
      { key: "end_date", label: "終了日", width: 100, render: (c) => formatDate(c.learning?.coaching_end_date ?? null) },
      { key: "remaining", label: "残回数", width: 70, align: "right" as const, render: (c) => c.learning ? calcRemainingSessions(c) : "-", sortValue: (c) => calcRemainingSessions(c) },
      { key: "progress", label: "進捗", width: 60, align: "center" as const, render: (c) => {
        const s = calcProgressStatus(c);
        const color = s === "順調" ? "text-green-400" : s === "遅延" ? "text-red-400" : "text-gray-500";
        return <span className={color}>{s}</span>;
      }},
      { key: "agent_enrolled", label: "エージェント利用", width: 110, align: "center" as const, render: (c) => isAgentCustomer(c) ? <span className="text-green-400">利用中</span> : "-" },
      { key: "agent_revenue", label: "人材見込売上", width: 120, align: "right" as const, render: (c) => { const v = calcAgentProjectedRevenue(c); return v > 0 ? formatCurrency(v) : "-"; }, sortValue: (c) => calcAgentProjectedRevenue(c) },
      { key: "offer_salary", label: "想定年収", width: 110, align: "right" as const, render: (c) => c.agent?.offer_salary ? formatCurrency(c.agent.offer_salary) : "-", sortValue: (c) => c.agent?.offer_salary || 0 },
      { key: "referral_fee", label: "紹介報酬", width: 110, align: "right" as const, render: (c) => { const v = calcExpectedReferralFee(c); return v > 0 ? formatCurrency(v) : "-"; }, sortValue: (c) => calcExpectedReferralFee(c) },
      { key: "agent_confirmed", label: "確定フラグ", width: 80, align: "center" as const, render: (c) => isAgentConfirmed(c) ? <span className="text-green-400">確定</span> : "-" },
      { key: "university", label: "大学", width: 130, render: (c) => c.university || "-", sortValue: (c) => c.university || "" },
      { key: "career", label: "職歴", width: 180, render: (c) => (
        <span className="max-w-[180px] truncate block" title={c.career_history || ""}>{c.career_history || "-"}</span>
      )},
      { key: "phone", label: "電話", width: 120, render: (c) => c.phone || "-" },
      { key: "email", label: "メール", width: 180, render: (c) => c.email || "-" },
      { key: "subsidy", label: "補助金", width: 100, align: "right" as const, render: (c) => { const v = getSubsidyAmount(c); return v > 0 ? formatCurrency(v) : "-"; }, sortValue: (c) => getSubsidyAmount(c) },
      { key: "notes", label: "備考", width: 200, render: (c) => (
        <span className="max-w-[200px] truncate block" title={c.notes || ""}>{c.notes || "-"}</span>
      )},
    ],
    []
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">顧客一覧</h1>
          <p className="text-sm text-gray-500 mt-1">
            全{viewMode === "spreadsheet" ? baseFiltered.length : filtered.length}件の顧客
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-surface-elevated rounded-lg p-0.5 border border-white/10">
            <button
              onClick={() => setViewMode("design")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "design"
                  ? "bg-brand text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              デザインビュー
            </button>
            <button
              onClick={() => setViewMode("spreadsheet")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "spreadsheet"
                  ? "bg-brand text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              スプレッドシートビュー
            </button>
          </div>
          <button className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors">
            + 新規顧客登録
          </button>
        </div>
      </div>

      {/* 共通フィルタバー（両ビューで使用） */}
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={attributeFilter}
            onChange={(e) => setAttributeFilter(e.target.value)}
            className="px-3 py-2 bg-surface-elevated border border-white/10 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">全属性</option>
            <option value="既卒">既卒</option>
            <option value="新卒">新卒</option>
          </select>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-3 py-2 bg-surface-elevated border border-white/10 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">全ステージ</option>
            <option value="問い合わせ">問い合わせ</option>
            <option value="日程確定">日程確定</option>
            <option value="面談実施">面談実施</option>
            <option value="提案中">提案中</option>
            <option value="成約">成約</option>
            <option value="入金済">入金済</option>
            <option value="失注">失注</option>
            <option value="保留">保留</option>
          </select>
          {viewMode === "design" && (
            <>
              <input
                type="text"
                placeholder="名前・メール・電話・大学で検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 bg-surface-elevated border border-white/10 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <select
                value={`${sortBy}-${sortDir}`}
                onChange={(e) => {
                  const [by, dir] = e.target.value.split("-");
                  setSortBy(by);
                  setSortDir(dir as "asc" | "desc");
                }}
                className="px-3 py-2 bg-surface-elevated border border-white/10 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="application_date-desc">申込日 (新しい順)</option>
                <option value="application_date-asc">申込日 (古い順)</option>
                <option value="name-asc">名前 (A-Z)</option>
                <option value="amount-desc">金額 (大きい順)</option>
              </select>
            </>
          )}
        </div>
      </div>

      {viewMode === "spreadsheet" ? (
        /* スプレッドシートビュー */
        <SpreadsheetTable
          columns={spreadsheetColumns}
          data={baseFiltered}
          getRowKey={(c) => c.id}
          searchPlaceholder="名前・メール・電話・大学で検索..."
          searchFilter={(c, q) =>
            c.name.toLowerCase().includes(q) ||
            (c.email?.toLowerCase().includes(q) ?? false) ||
            (c.phone?.includes(q) ?? false) ||
            (c.university?.toLowerCase().includes(q) ?? false)
          }
        />
      ) : (
        /* デザインビュー（既存） */
        <>
          <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-elevated border-b border-white/10">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">顧客</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">属性</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">流入元</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">ステージ</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">商談状況</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">契約金額</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">申込日</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-b border-white/[0.08] hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="flex items-center gap-3 group"
                        >
                          <div className="w-9 h-9 bg-brand-muted text-brand rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                            {customer.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-white group-hover:text-brand transition-colors">
                              {customer.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {customer.email || "-"}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(customer.attribute)}`}
                        >
                          {customer.attribute}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {customer.utm_source || "-"}
                      </td>
                      <td className="py-3 px-4">
                        {customer.pipeline && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(customer.pipeline.stage)}`}
                          >
                            {customer.pipeline.stage}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {customer.pipeline && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDealStatusColor(customer.pipeline.deal_status)}`}
                          >
                            {customer.pipeline.deal_status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-white">
                        {customer.contract?.confirmed_amount
                          ? formatCurrency(customer.contract.confirmed_amount)
                          : "-"}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {formatDate(customer.application_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
