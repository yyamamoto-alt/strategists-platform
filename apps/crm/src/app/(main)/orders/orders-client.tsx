"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from "@/components/spreadsheet-table";
import type { Order } from "@strategy-school/shared-db";
import type { ReconciliationItem } from "@/lib/data/orders";

type PageTab = "orders" | "reconciliation";
type SourceFilter = "all" | "apps" | "bank_transfer" | "stripe" | "manual" | "excel_migration";

const SOURCE_LABELS: Record<string, string> = {
  apps: "Apps",
  bank_transfer: "銀行振込",
  stripe: "Stripe",
  manual: "手動",
  excel_migration: "Excel移行",
  freee: "Freee",
};

const MATCH_STATUS_STYLES: Record<string, string> = {
  matched: "bg-green-500/20 text-green-400",
  unmatched: "bg-red-500/20 text-red-400",
  manual: "bg-yellow-500/20 text-yellow-400",
};

const MATCH_STATUS_LABELS: Record<string, string> = {
  matched: "紐付済",
  unmatched: "未紐付",
  manual: "手動",
};

interface OrdersClientProps {
  orders: Order[];
  reconciliation: ReconciliationItem[];
}

export function OrdersClient({ orders, reconciliation }: OrdersClientProps) {
  const [pageTab, setPageTab] = useState<PageTab>("orders");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const filteredOrders = useMemo(() => {
    if (sourceFilter === "all") return orders;
    if (sourceFilter === "bank_transfer") {
      return orders.filter((o) => o.payment_method === "bank_transfer");
    }
    if (sourceFilter === "apps") {
      return orders.filter(
        (o) => o.payment_method === ("apps" as string)
      );
    }
    return orders.filter((o) => o.source === sourceFilter);
  }, [orders, sourceFilter]);

  // KPI計算
  const stats = useMemo(() => {
    const total = orders.reduce((s, o) => s + o.amount, 0);
    const matchedCount = orders.filter(
      (o) => o.match_status === "matched"
    ).length;
    const unmatchedCount = orders.filter(
      (o) => o.match_status === "unmatched"
    ).length;
    const matchRate = orders.length > 0 ? matchedCount / orders.length : 0;

    const sourceCounts: Record<string, number> = {};
    for (const o of orders) {
      const key = o.payment_method || o.source;
      sourceCounts[key] = (sourceCounts[key] || 0) + 1;
    }

    return { total, matchedCount, unmatchedCount, matchRate, sourceCounts };
  }, [orders]);

  const orderColumns: SpreadsheetColumn<Order>[] = useMemo(
    () => [
      {
        key: "paid_at",
        label: "決済日",
        width: 100,
        render: (r) => formatDate(r.paid_at),
        sortValue: (r) => r.paid_at || "",
      },
      {
        key: "contact_name",
        label: "顧客名",
        width: 140,
        render: (r) => r.contact_name || "-",
        sortValue: (r) => r.contact_name || "",
      },
      {
        key: "amount",
        label: "金額",
        width: 110,
        align: "right" as const,
        render: (r) => formatCurrency(r.amount),
        sortValue: (r) => r.amount,
      },
      {
        key: "amount_excl_tax",
        label: "税抜",
        width: 110,
        align: "right" as const,
        render: (r) =>
          r.amount_excl_tax !== null
            ? formatCurrency(r.amount_excl_tax)
            : "-",
        sortValue: (r) => r.amount_excl_tax || 0,
      },
      {
        key: "product_name",
        label: "商品名",
        width: 180,
        render: (r) => r.product_name || "-",
        sortValue: (r) => r.product_name || "",
      },
      {
        key: "order_type",
        label: "種別",
        width: 100,
        render: (r) => {
          const labels: Record<string, string> = {
            main_plan: "メインプラン",
            video_course: "動画講座",
            additional_coaching: "追加指導",
            other: "その他",
          };
          return labels[r.order_type] || r.order_type;
        },
      },
      {
        key: "payment_method",
        label: "決済方法",
        width: 90,
        render: (r) =>
          SOURCE_LABELS[r.payment_method || ""] || r.payment_method || "-",
      },
      {
        key: "source",
        label: "ソース",
        width: 90,
        render: (r) => SOURCE_LABELS[r.source] || r.source,
      },
      {
        key: "status",
        label: "ステータス",
        width: 80,
        render: (r) => r.status || "-",
      },
      {
        key: "match_status",
        label: "マッチ",
        width: 80,
        render: (r) => (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              MATCH_STATUS_STYLES[r.match_status] || ""
            }`}
          >
            {MATCH_STATUS_LABELS[r.match_status] || r.match_status}
          </span>
        ),
      },
      {
        key: "contact_email",
        label: "メール",
        width: 200,
        render: (r) => (
          <span className="text-gray-400 text-xs">
            {r.contact_email || "-"}
          </span>
        ),
      },
    ],
    []
  );

  const reconColumns: SpreadsheetColumn<ReconciliationItem>[] = useMemo(
    () => [
      {
        key: "customer_name",
        label: "顧客名",
        width: 160,
        render: (r) => r.customer_name,
        sortValue: (r) => r.customer_name,
      },
      {
        key: "contract_confirmed",
        label: "契約確定額",
        width: 130,
        align: "right" as const,
        render: (r) => formatCurrency(r.contract_confirmed),
        sortValue: (r) => r.contract_confirmed,
      },
      {
        key: "orders_total",
        label: "注文合計",
        width: 130,
        align: "right" as const,
        render: (r) => formatCurrency(r.orders_total),
        sortValue: (r) => r.orders_total,
      },
      {
        key: "difference",
        label: "差分",
        width: 130,
        align: "right" as const,
        render: (r) => (
          <span
            className={
              r.difference > 0
                ? "text-red-400"
                : r.difference < 0
                  ? "text-yellow-400"
                  : "text-gray-400"
            }
          >
            {r.difference > 0 ? "+" : ""}
            {formatCurrency(r.difference)}
          </span>
        ),
        sortValue: (r) => Math.abs(r.difference),
      },
    ],
    []
  );

  const sourceFilterOptions: { key: SourceFilter; label: string }[] = [
    { key: "all", label: `全件 (${orders.length})` },
    {
      key: "apps",
      label: `Apps (${orders.filter((o) => o.payment_method === "apps").length})`,
    },
    {
      key: "bank_transfer",
      label: `銀行振込 (${orders.filter((o) => o.payment_method === "bank_transfer").length})`,
    },
    {
      key: "stripe",
      label: `Stripe (${orders.filter((o) => o.source === "stripe").length})`,
    },
    {
      key: "manual",
      label: `手動 (${orders.filter((o) => o.source === "manual").length})`,
    },
  ];

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">注文管理</h1>
        {stats.unmatchedCount > 0 && (
          <Link
            href="/orders/unmatched"
            className="px-3 py-1.5 bg-red-500/20 text-red-400 text-xs rounded-lg hover:bg-red-500/30 transition-colors"
          >
            未マッチ {stats.unmatchedCount}件を管理
          </Link>
        )}
      </div>

      {/* ページタブ */}
      <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5 w-fit border border-white/10">
        <button
          onClick={() => setPageTab("orders")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            pageTab === "orders"
              ? "bg-brand text-white shadow-sm"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          注文一覧
        </button>
        <button
          onClick={() => setPageTab("reconciliation")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            pageTab === "reconciliation"
              ? "bg-brand text-white shadow-sm"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          突合レポート ({reconciliation.length})
        </button>
      </div>

      {pageTab === "orders" ? (
        <>
          {/* KPIカード */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-surface-card rounded-xl border border-white/10 p-3">
              <p className="text-xs text-gray-500">総取引額</p>
              <p className="text-lg font-bold text-white">
                {formatCurrency(stats.total)}
              </p>
              <p className="text-xs text-gray-500">{orders.length}件</p>
            </div>
            <div className="bg-surface-card rounded-xl border border-white/10 p-3">
              <p className="text-xs text-gray-500">マッチ率</p>
              <p className="text-lg font-bold text-white">
                {Math.round(stats.matchRate * 100)}%
              </p>
              <p className="text-xs text-gray-500">
                {stats.matchedCount}件 紐付済
              </p>
            </div>
            <div className="bg-surface-card rounded-xl border border-white/10 p-3">
              <p className="text-xs text-gray-500">未紐付</p>
              <p className="text-lg font-bold text-red-400">
                {stats.unmatchedCount}件
              </p>
              <p className="text-xs text-gray-500">要確認</p>
            </div>
            <div className="bg-surface-card rounded-xl border border-white/10 p-3">
              <p className="text-xs text-gray-500">ソース別</p>
              <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                {Object.entries(stats.sourceCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([key, count]) => (
                    <div key={key}>
                      {SOURCE_LABELS[key] || key}: {count}件
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* フィルタータブ */}
          <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5 w-fit border border-white/10">
            {sourceFilterOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSourceFilter(opt.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  sourceFilter === opt.key
                    ? "bg-brand text-white shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* テーブル */}
          <SpreadsheetTable
            columns={orderColumns}
            data={filteredOrders}
            getRowKey={(r) => r.id}
            storageKey="orders-list"
            searchPlaceholder="名前・メール・商品名で検索..."
            searchFilter={(r, q) =>
              (r.contact_name?.toLowerCase().includes(q) ?? false) ||
              (r.contact_email?.toLowerCase().includes(q) ?? false) ||
              (r.product_name?.toLowerCase().includes(q) ?? false)
            }
          />
        </>
      ) : (
        <>
          {/* 突合レポート */}
          <div className="bg-surface-card rounded-xl border border-white/10 p-3 mb-2">
            <p className="text-xs text-gray-500">
              契約確定額 vs 注文合計の差分を表示。差分がある顧客のみ表示しています。
            </p>
          </div>
          {reconciliation.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              差分のある顧客はありません
            </div>
          ) : (
            <SpreadsheetTable
              columns={reconColumns}
              data={reconciliation}
              getRowKey={(r) => r.customer_id}
              storageKey="orders-reconciliation"
              searchPlaceholder="顧客名で検索..."
              searchFilter={(r, q) =>
                r.customer_name.toLowerCase().includes(q)
              }
            />
          )}
        </>
      )}
    </div>
  );
}
