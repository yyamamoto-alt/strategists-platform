"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import type { AccountsReceivableSummary } from "@/lib/data/orders";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "支払予定",
  pending: "未入金",
  partial: "一部入金",
};

const STATUS_DOTS: Record<string, string> = {
  scheduled: "bg-blue-400",
  pending: "bg-gray-400",
  partial: "bg-amber-400",
};

export function ReceivableClient({ data }: { data: AccountsReceivableSummary }) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  if (data.totalCount === 0) {
    return (
      <div className="px-6">
        <div className="bg-surface-card rounded-xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-2">売掛金</h2>
          <p className="text-sm text-gray-500">未入金の注文はありません</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6">
      <div className="bg-surface-card rounded-xl border border-white/10 p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-white">売掛金</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              月別入金予定 ({data.totalCount}件)
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-white">
              {formatCurrency(data.totalAmount)}
            </p>
            <p className="text-xs text-gray-500">合計</p>
          </div>
        </div>

        {/* 月別バー */}
        <div className="space-y-3">
          {data.months.map((month) => {
            const isExpanded = expandedMonth === month.month;
            const ratio = data.totalAmount > 0
              ? (month.amount / data.totalAmount) * 100
              : 0;

            return (
              <div key={month.month}>
                <button
                  onClick={() => setExpandedMonth(isExpanded ? null : month.month)}
                  className="w-full text-left group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                      {month.label}
                      <span className="text-gray-500 ml-2 text-xs">{month.count}件</span>
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {formatCurrency(month.amount)}
                    </span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(ratio, 2)}%` }}
                    />
                  </div>
                </button>

                {/* 展開時の明細 */}
                {isExpanded && (
                  <div className="mt-2 ml-2 space-y-1.5">
                    {month.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white/[0.03] text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOTS[item.status] || "bg-gray-400"}`} />
                          <span className="text-gray-300 truncate">
                            {item.customer_name || "不明"}
                          </span>
                          {item.product_name && (
                            <span className="text-gray-500 truncate hidden sm:inline">
                              - {item.product_name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-gray-500">
                            {STATUS_LABELS[item.status] || item.status}
                          </span>
                          <span className="text-white font-medium">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 凡例 */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[key]}`} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
