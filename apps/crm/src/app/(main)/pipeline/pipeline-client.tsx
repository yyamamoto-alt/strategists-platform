"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  formatDate,
  formatCurrency,
  getStageColor,
  getAttributeColor,
  formatPercent,
} from "@/lib/utils";
import { calcClosingProbability } from "@/lib/calc-fields";
import type { CustomerWithRelations } from "@strategy-school/shared-db";

// 4ステージのみ（ビジネスフロー順）
const KANBAN_STAGES = [
  {
    label: "未実施",
    match: ["未実施", "日程未確", "日程確定", "問い合わせ"],
    borderColor: "border-t-yellow-400",
    rich: false,
  },
  {
    label: "検討中",
    match: ["検討中", "長期検討", "提案中", "面談実施"],
    borderColor: "border-t-blue-400",
    rich: true,
  },
  {
    label: "追加指導",
    matchPrefix: "追加指導",
    match: [] as string[],
    borderColor: "border-t-purple-400",
    rich: false,
  },
  {
    label: "成約（直近2週間のみ）",
    match: ["成約", "入金済"],
    borderColor: "border-t-green-400",
    rich: false,
    recentOnly: true,
  },
];

interface PipelineClientProps {
  customers: CustomerWithRelations[];
}

export function PipelineClient({ customers }: PipelineClientProps) {
  const twoWeeksAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const byStage = useMemo(() => {
    return KANBAN_STAGES.map((stageDef) => {
      let stageCustomers = customers.filter((c) => {
        const stage = c.pipeline?.stage;
        if (!stage) return false;
        if (stageDef.matchPrefix && stage.startsWith(stageDef.matchPrefix)) return true;
        return stageDef.match.includes(stage);
      });

      // 成約は直近2週間のみ
      if (stageDef.recentOnly) {
        stageCustomers = stageCustomers.filter((c) => {
          const closingDate = c.pipeline?.closing_date || c.pipeline?.payment_date || c.application_date;
          return closingDate && closingDate >= twoWeeksAgo;
        });
      }

      return {
        ...stageDef,
        customers: stageCustomers,
      };
    });
  }, [customers, twoWeeksAgo]);

  const totalValue = customers
    .filter((c) => c.contract?.confirmed_amount)
    .reduce((sum, c) => sum + (c.contract?.confirmed_amount || 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">営業パイプライン</h1>
        <p className="text-sm text-gray-500 mt-1">
          総商談額: {formatCurrency(totalValue)} / {customers.length}件
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {byStage.map(({ label, borderColor, rich, customers }) => (
          <div
            key={label}
            className={`flex-shrink-0 ${rich ? "w-96" : "w-72"} bg-surface rounded-xl border-t-4 ${borderColor}`}
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
                  {/* ヘッダー: 名前 + 属性 */}
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

                  {/* リッチ表示: 検討中ステージのみ */}
                  {rich && customer.pipeline && (
                    <div className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2">
                      {/* 営業角度 */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">営業角度</span>
                        <span className="text-xs font-semibold text-white">
                          {customer.pipeline.probability != null && customer.pipeline.probability > 0
                            ? formatPercent(customer.pipeline.probability)
                            : "未設定"}
                        </span>
                      </div>
                      {/* 成約見込率 */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">成約見込</span>
                        <span className="text-xs font-semibold text-amber-400">
                          {formatPercent(calcClosingProbability(customer))}
                        </span>
                      </div>
                      {/* 実施状況 */}
                      {customer.pipeline.deal_status && (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-500">実施状況</span>
                          <span className="text-xs text-gray-300">{customer.pipeline.deal_status}</span>
                        </div>
                      )}
                      {/* 検討内容 */}
                      {customer.pipeline.sales_content && (
                        <div className="mt-1">
                          <span className="text-[10px] text-gray-500 block">営業内容</span>
                          <p className="text-[11px] text-gray-300 mt-0.5 line-clamp-2">
                            {customer.pipeline.sales_content}
                          </p>
                        </div>
                      )}
                      {/* 営業戦略 */}
                      {customer.pipeline.sales_strategy && (
                        <div className="mt-1">
                          <span className="text-[10px] text-gray-500 block">営業戦略</span>
                          <p className="text-[11px] text-gray-300 mt-0.5 line-clamp-2">
                            {customer.pipeline.sales_strategy}
                          </p>
                        </div>
                      )}
                      {/* 判断基準 */}
                      {customer.pipeline.decision_factor && (
                        <div className="mt-1">
                          <span className="text-[10px] text-gray-500 block">判断基準</span>
                          <p className="text-[11px] text-gray-300 mt-0.5 line-clamp-2">
                            {customer.pipeline.decision_factor}
                          </p>
                        </div>
                      )}
                      {/* 比較検討サービス */}
                      {customer.pipeline.comparison_services && (
                        <div className="mt-1">
                          <span className="text-[10px] text-gray-500 block">比較検討</span>
                          <p className="text-[11px] text-gray-300 mt-0.5 line-clamp-1">
                            {customer.pipeline.comparison_services}
                          </p>
                        </div>
                      )}
                      {/* 面談予定日 */}
                      {customer.pipeline.meeting_scheduled_date && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-gray-500">面談予定</span>
                          <span className="text-xs text-gray-300">
                            {formatDate(customer.pipeline.meeting_scheduled_date)}
                          </span>
                        </div>
                      )}
                      {/* 追加営業内容 */}
                      {customer.pipeline.additional_sales_content && (
                        <div className="mt-1">
                          <span className="text-[10px] text-gray-500 block">追加営業</span>
                          <p className="text-[11px] text-gray-300 mt-0.5 line-clamp-2">
                            {customer.pipeline.additional_sales_content}
                          </p>
                        </div>
                      )}
                      {/* 営業担当 */}
                      {customer.pipeline.sales_person && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-gray-500">営業担当</span>
                          <span className="text-xs text-gray-300">{customer.pipeline.sales_person}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 金額 + 日付 */}
                  {customer.contract?.confirmed_amount ? (
                    <p className="text-xs font-medium text-green-400 mt-1">
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
    </div>
  );
}
