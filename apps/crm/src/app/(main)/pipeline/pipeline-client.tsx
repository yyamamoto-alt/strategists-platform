"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatDate,
  formatCurrency,
  getStageColor,
  getAttributeColor,
} from "@/lib/utils";
import type { CustomerWithRelations } from "@strategy-school/shared-db";

// 実データのステージ値に合わせた定義（ビジネスフロー順）
const KANBAN_STAGES = [
  // アクティブ（商談進行中）
  { label: "日程未確", match: ["日程未確"], borderColor: "border-t-slate-400" },
  { label: "検討中", match: ["検討中", "長期検討"], borderColor: "border-t-blue-400" },
  // 成約系
  { label: "成約", match: ["成約"], borderColor: "border-t-green-400" },
  { label: "追加購入", match: ["その他購入", "動画講座購入", "追加指導"], borderColor: "border-t-emerald-400" },
  // 未実施系
  { label: "NoShow", match: ["NoShow"], borderColor: "border-t-amber-400" },
  { label: "未実施", match: ["未実施", "実施不可", "非実施対象"], borderColor: "border-t-yellow-400" },
  // 失注系
  { label: "失注", match: ["失注", "失注見込", "失注見込(自動)", "CL", "全額返金"], borderColor: "border-t-red-400" },
  // その他
  { label: "その他", match: [], borderColor: "border-t-gray-400" },
];

// フィルタドロップダウン用の全ステージ
const ALL_STAGES = [
  "日程未確", "検討中", "長期検討",
  "成約", "その他購入", "動画講座購入", "追加指導",
  "NoShow", "未実施", "実施不可", "非実施対象",
  "失注", "失注見込", "失注見込(自動)", "CL", "全額返金",
  "その他",
];

interface PipelineClientProps {
  customers: CustomerWithRelations[];
}

export function PipelineClient({ customers }: PipelineClientProps) {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [stageFilter, setStageFilter] = useState<string>("");

  // テーブルビュー用フィルタ
  const filteredCustomers = stageFilter
    ? customers.filter((c) => c.pipeline?.stage === stageFilter)
    : customers;

  // カンバン: ステージごとに顧客をグループ化
  const allMatchedStages = new Set(KANBAN_STAGES.flatMap((s) => s.match));
  const byStage = KANBAN_STAGES.map((stageDef) => ({
    ...stageDef,
    customers: customers.filter((c) => {
      const stage = c.pipeline?.stage;
      if (!stage) return stageDef.match.length === 0; // その他
      if (stageDef.match.length === 0) {
        // "その他" = マッチしないもの全て
        return !allMatchedStages.has(stage);
      }
      return stageDef.match.includes(stage);
    }),
  }));

  const totalValue = customers
    .filter((c) => c.contract?.confirmed_amount)
    .reduce((sum, c) => sum + (c.contract?.confirmed_amount || 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">営業パイプライン</h1>
          <p className="text-sm text-gray-500 mt-1">
            総商談額: {formatCurrency(totalValue)} / {customers.length}件
          </p>
        </div>
        <div className="flex items-center gap-2">
          {view === "table" && (
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="px-2 py-1.5 text-sm bg-surface-elevated border border-white/10 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">全ステージ</option>
              {ALL_STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setView("kanban")}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              view === "kanban"
                ? "bg-brand text-white"
                : "bg-surface-elevated text-gray-400 hover:bg-white/5"
            }`}
          >
            カンバン
          </button>
          <button
            onClick={() => setView("table")}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              view === "table"
                ? "bg-brand text-white"
                : "bg-surface-elevated text-gray-400 hover:bg-white/5"
            }`}
          >
            テーブル
          </button>
        </div>
      </div>

      {view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {byStage.map(({ label, borderColor, customers }) => (
            <div
              key={label}
              className={`flex-shrink-0 w-72 bg-surface rounded-xl border-t-4 ${borderColor}`}
            >
              <div className="p-3 border-b border-white/10 bg-surface-card rounded-t-xl">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-white">{label}</h3>
                  <span className="bg-white/10 text-gray-300 text-xs font-medium px-2 py-0.5 rounded-full">
                    {customers.length}
                  </span>
                </div>
                {customers.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {formatCurrency(
                      customers.reduce(
                        (sum, c) => sum + (c.contract?.confirmed_amount || 0),
                        0
                      )
                    )}
                  </p>
                )}
              </div>
              <div className="p-2 space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
                {customers.map((customer) => (
                  <Link
                    key={customer.id}
                    href={`/customers/${customer.id}`}
                    className="block bg-surface-card rounded-lg border border-white/10 p-3 hover:shadow-[0_4px_6px_rgba(0,0,0,0.4)] transition-shadow"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 bg-brand-muted text-brand rounded-full flex items-center justify-center font-bold text-xs">
                        {customer.name.charAt(0)}
                      </div>
                      <span className="font-medium text-sm text-white">
                        {customer.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mb-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getAttributeColor(customer.attribute)}`}
                      >
                        {customer.attribute}
                      </span>
                      {customer.pipeline?.stage && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getStageColor(customer.pipeline.stage)}`}>
                          {customer.pipeline.stage}
                        </span>
                      )}
                    </div>
                    {customer.contract?.confirmed_amount ? (
                      <p className="text-xs font-medium text-green-400">
                        {formatCurrency(customer.contract.confirmed_amount)}
                      </p>
                    ) : null}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {formatDate(customer.application_date)}
                    </p>
                  </Link>
                ))}
                {customers.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-8">なし</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-elevated border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">顧客</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">検討状況</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">実施状況</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">営業担当</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">営業実施日</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">確定売上</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">申込日</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c) => (
                <tr key={c.id} className="border-b border-white/[0.08] hover:bg-white/5">
                  <td className="py-3 px-4">
                    <Link href={`/customers/${c.id}`} className="font-medium text-sm text-white hover:text-brand">
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    {c.pipeline && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(c.pipeline.stage)}`}>
                        {c.pipeline.stage}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-300">{c.pipeline?.deal_status || "-"}</td>
                  <td className="py-3 px-4 text-sm text-gray-300">{c.pipeline?.sales_person || "-"}</td>
                  <td className="py-3 px-4 text-sm text-gray-300">{formatDate(c.pipeline?.sales_date ?? null)}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium text-white">
                    {c.contract?.confirmed_amount ? formatCurrency(c.contract.confirmed_amount) : "-"}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-300">{formatDate(c.application_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
