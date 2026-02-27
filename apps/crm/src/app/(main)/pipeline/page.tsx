"use client";

import { useState } from "react";
import Link from "next/link";
import { mockCustomers } from "@/lib/mock-data";
import {
  formatDate,
  formatCurrency,
  getStageColor,
  getAttributeColor,
} from "@/lib/utils";
import { PipelineStage } from "@/types/database";

const STAGES: PipelineStage[] = [
  "問い合わせ",
  "日程確定",
  "面談実施",
  "提案中",
  "成約",
  "入金済",
];

const STAGE_COLORS: Record<string, string> = {
  問い合わせ: "border-t-gray-400",
  日程確定: "border-t-blue-400",
  面談実施: "border-t-indigo-400",
  提案中: "border-t-yellow-400",
  成約: "border-t-green-400",
  入金済: "border-t-emerald-400",
};

export default function PipelinePage() {
  const [view, setView] = useState<"kanban" | "table">("kanban");

  const byStage = STAGES.map((stage) => ({
    stage,
    customers: mockCustomers.filter((c) => c.pipeline?.stage === stage),
  }));

  const totalValue = mockCustomers
    .filter((c) => c.contract?.confirmed_amount)
    .reduce((sum, c) => sum + (c.contract?.confirmed_amount || 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            営業パイプライン
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            総商談額: {formatCurrency(totalValue)} / {mockCustomers.length}件
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("kanban")}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              view === "kanban"
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            カンバン
          </button>
          <button
            onClick={() => setView("table")}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              view === "table"
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            テーブル
          </button>
        </div>
      </div>

      {view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {byStage.map(({ stage, customers }) => (
            <div
              key={stage}
              className={`flex-shrink-0 w-72 bg-gray-50 rounded-xl border-t-4 ${STAGE_COLORS[stage]}`}
            >
              <div className="p-3 border-b bg-white rounded-t-xl">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{stage}</h3>
                  <span className="bg-gray-200 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    {customers.length}
                  </span>
                </div>
                {customers.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {formatCurrency(
                      customers.reduce(
                        (sum, c) =>
                          sum + (c.contract?.confirmed_amount || 0),
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
                    className="block bg-white rounded-lg border p-3 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-bold text-xs">
                        {customer.name.charAt(0)}
                      </div>
                      <span className="font-medium text-sm">
                        {customer.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mb-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getAttributeColor(
                          customer.attribute
                        )}`}
                      >
                        {customer.attribute}
                      </span>
                      {customer.utm_source && (
                        <span className="text-[10px] text-gray-400">
                          via {customer.utm_source}
                        </span>
                      )}
                    </div>
                    {customer.contract?.confirmed_amount && (
                      <p className="text-xs font-medium text-green-600">
                        {formatCurrency(customer.contract.confirmed_amount)}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {formatDate(customer.application_date)}
                    </p>
                  </Link>
                ))}
                {customers.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-8">
                    なし
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">顧客</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">ステージ</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">面談予定</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">面談実施</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">成約日</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500">金額</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">比較サービス</th>
              </tr>
            </thead>
            <tbody>
              {mockCustomers.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <Link href={`/customers/${c.id}`} className="font-medium text-sm hover:text-primary-600">
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
                  <td className="py-3 px-4 text-sm">{formatDate(c.pipeline?.meeting_scheduled_date || null)}</td>
                  <td className="py-3 px-4 text-sm">{formatDate(c.pipeline?.meeting_conducted_date || null)}</td>
                  <td className="py-3 px-4 text-sm">{formatDate(c.pipeline?.closing_date || null)}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium">
                    {c.contract?.confirmed_amount ? formatCurrency(c.contract.confirmed_amount) : "-"}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{c.pipeline?.comparison_services || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
