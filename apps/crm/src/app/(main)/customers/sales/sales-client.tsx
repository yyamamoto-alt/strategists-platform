"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { CustomerWithRelations } from "@strategy-school/shared-db";
import {
  formatDate,
  formatCurrency,
  formatPercent,
  getStageColor,
  getAttributeColor,
  getDealStatusColor,
} from "@/lib/utils";
import {
  calcClosingProbability,
  calcExpectedLTV,
  calcSalesProjection,
} from "@/lib/calc-fields";
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from "@/components/spreadsheet-table";

interface SalesClientProps {
  customers: CustomerWithRelations[];
}

export function SalesClient({ customers }: SalesClientProps) {
  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let meetingsThisMonth = 0;
    let closedThisMonth = 0;
    let pipelineTotal = 0;
    let leadTimeDays: number[] = [];

    for (const c of customers) {
      // 今月面談
      if (c.pipeline?.meeting_conducted_date?.startsWith(thisMonth)) {
        meetingsThisMonth++;
      }
      // 今月成約
      if (c.pipeline?.closing_date?.startsWith(thisMonth)) {
        closedThisMonth++;
      }
      // パイプライン総額（未成約のみ）
      if (
        c.pipeline &&
        c.pipeline.stage !== "成約" &&
        c.pipeline.stage !== "入金済" &&
        c.pipeline.stage !== "失注"
      ) {
        pipelineTotal += c.pipeline.projected_amount || 0;
      }
      // リードタイム
      if (c.pipeline?.closing_date && c.application_date) {
        const diff =
          new Date(c.pipeline.closing_date).getTime() -
          new Date(c.application_date).getTime();
        if (diff > 0) leadTimeDays.push(diff / (1000 * 60 * 60 * 24));
      }
    }

    const closingRate =
      meetingsThisMonth > 0 ? closedThisMonth / meetingsThisMonth : 0;
    const avgLeadTime =
      leadTimeDays.length > 0
        ? Math.round(leadTimeDays.reduce((a, b) => a + b, 0) / leadTimeDays.length)
        : 0;

    return {
      meetingsThisMonth,
      closedThisMonth,
      closingRate,
      pipelineTotal,
      avgLeadTime,
    };
  }, [customers]);

  const columns: SpreadsheetColumn<CustomerWithRelations>[] = useMemo(
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
      {
        key: "attribute",
        label: "属性",
        width: 70,
        render: (c) => (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(c.attribute)}`}>
            {c.attribute}
          </span>
        ),
        sortValue: (c) => c.attribute,
      },
      {
        key: "stage",
        label: "ステージ",
        width: 90,
        render: (c) =>
          c.pipeline ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(c.pipeline.stage)}`}>
              {c.pipeline.stage}
            </span>
          ) : (
            "-"
          ),
        sortValue: (c) => c.pipeline?.stage || "",
      },
      {
        key: "deal_status",
        label: "商談状況",
        width: 90,
        render: (c) =>
          c.pipeline ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDealStatusColor(c.pipeline.deal_status)}`}>
              {c.pipeline.deal_status}
            </span>
          ) : (
            "-"
          ),
        sortValue: (c) => c.pipeline?.deal_status || "",
      },
      {
        key: "meeting_scheduled",
        label: "面談予定日",
        width: 100,
        render: (c) => formatDate(c.pipeline?.meeting_scheduled_date ?? null),
        sortValue: (c) => c.pipeline?.meeting_scheduled_date || "",
      },
      {
        key: "meeting_conducted",
        label: "面談実施日",
        width: 100,
        render: (c) => formatDate(c.pipeline?.meeting_conducted_date ?? null),
        sortValue: (c) => c.pipeline?.meeting_conducted_date || "",
      },
      {
        key: "meeting_result",
        label: "面談結果",
        width: 160,
        render: (c) => (
          <span className="max-w-[160px] truncate block" title={c.pipeline?.meeting_result || ""}>
            {c.pipeline?.meeting_result || "-"}
          </span>
        ),
      },
      {
        key: "sales_content",
        label: "提案内容",
        width: 180,
        render: (c) => (
          <span className="max-w-[180px] truncate block" title={c.pipeline?.sales_content || ""}>
            {c.pipeline?.sales_content || "-"}
          </span>
        ),
      },
      {
        key: "sales_strategy",
        label: "営業戦略",
        width: 140,
        render: (c) => (
          <span className="max-w-[140px] truncate block" title={c.pipeline?.sales_strategy || ""}>
            {c.pipeline?.sales_strategy || "-"}
          </span>
        ),
      },
      {
        key: "decision_factor",
        label: "決め手",
        width: 120,
        render: (c) => c.pipeline?.decision_factor || "-",
      },
      {
        key: "comparison",
        label: "比較サービス",
        width: 140,
        render: (c) => (
          <span className="max-w-[140px] truncate block" title={c.pipeline?.comparison_services || ""}>
            {c.pipeline?.comparison_services || "-"}
          </span>
        ),
      },
      {
        key: "closing_date",
        label: "成約日",
        width: 100,
        render: (c) => formatDate(c.pipeline?.closing_date ?? null),
        sortValue: (c) => c.pipeline?.closing_date || "",
      },
      {
        key: "payment_date",
        label: "入金日",
        width: 100,
        render: (c) => formatDate(c.pipeline?.payment_date ?? null),
        sortValue: (c) => c.pipeline?.payment_date || "",
      },
      {
        key: "confirmed_amount",
        label: "確定売上",
        width: 110,
        align: "right",
        render: (c) =>
          c.contract?.confirmed_amount
            ? formatCurrency(c.contract.confirmed_amount)
            : "-",
        sortValue: (c) => c.contract?.confirmed_amount || 0,
      },
      {
        key: "sales_projection",
        label: "売上見込",
        width: 110,
        align: "right",
        render: (c) => {
          const v = calcSalesProjection(c);
          return v > 0 ? formatCurrency(v) : "-";
        },
        sortValue: (c) => calcSalesProjection(c),
      },
      {
        key: "closing_prob",
        label: "成約見込",
        width: 80,
        align: "right",
        render: (c) => formatPercent(calcClosingProbability(c)),
        sortValue: (c) => calcClosingProbability(c),
      },
      {
        key: "expected_ltv",
        label: "見込LTV",
        width: 110,
        align: "right",
        render: (c) => {
          const v = calcExpectedLTV(c);
          return v > 0 ? formatCurrency(v) : "-";
        },
        sortValue: (c) => calcExpectedLTV(c),
      },
      {
        key: "sales_person",
        label: "営業担当",
        width: 100,
        render: (c) => c.pipeline?.sales_person || "-",
      },
      {
        key: "lead_time",
        label: "リードタイム",
        width: 100,
        render: (c) => c.pipeline?.lead_time || "-",
      },
      {
        key: "postponement_date",
        label: "保留日",
        width: 100,
        render: (c) => formatDate(c.pipeline?.postponement_date ?? null),
        sortValue: (c) => c.pipeline?.postponement_date || "",
      },
    ],
    []
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">営業DB</h1>
        <p className="text-sm text-gray-500 mt-1">
          パイプライン・商談状況の全体ビュー
        </p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">今月面談数</p>
          <p className="text-2xl font-bold text-white mt-1">{kpis.meetingsThisMonth}</p>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">今月成約数</p>
          <p className="text-2xl font-bold text-white mt-1">{kpis.closedThisMonth}</p>
          <p className="text-xs text-gray-500 mt-1">
            成約率 {formatPercent(kpis.closingRate)}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">パイプライン総額</p>
          <p className="text-2xl font-bold text-white mt-1">
            {formatCurrency(kpis.pipelineTotal)}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">平均リードタイム</p>
          <p className="text-2xl font-bold text-white mt-1">
            {kpis.avgLeadTime > 0 ? `${kpis.avgLeadTime}日` : "-"}
          </p>
        </div>
      </div>

      {/* テーブル */}
      <SpreadsheetTable
        columns={columns}
        data={customers}
        getRowKey={(c) => c.id}
        searchPlaceholder="名前・商談状況・営業担当で検索..."
        searchFilter={(c, q) =>
          c.name.toLowerCase().includes(q) ||
          (c.pipeline?.deal_status?.toLowerCase().includes(q) ?? false) ||
          (c.pipeline?.sales_person?.toLowerCase().includes(q) ?? false) ||
          (c.pipeline?.sales_content?.toLowerCase().includes(q) ?? false)
        }
      />
    </div>
  );
}
