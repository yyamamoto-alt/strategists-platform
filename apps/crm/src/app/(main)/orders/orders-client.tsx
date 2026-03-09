"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
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

const ORDER_STATUS_LABELS: Record<string, string> = {
  paid: "入金済",
  scheduled: "支払予定",
  partial: "一部入金",
  pending: "未入金",
  refunded: "返金済",
  cancelled: "キャンセル",
};

const ORDER_STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-500/20 text-green-400",
  scheduled: "bg-blue-500/20 text-blue-400",
  partial: "bg-amber-500/20 text-amber-400",
  pending: "bg-gray-500/20 text-gray-400",
  refunded: "bg-red-500/20 text-red-400",
  cancelled: "bg-gray-600/20 text-gray-500",
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

export function OrdersClient({ orders: initialOrders, reconciliation }: OrdersClientProps) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [pageTab, setPageTab] = useState<PageTab>("orders");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [processing, setProcessing] = useState(false);

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

  const unmatchedCount = useMemo(
    () => orders.filter((o) => o.match_status === "unmatched").length,
    [orders]
  );

  const handleDeleteOrder = useCallback(async (orderId: string) => {
    if (!window.confirm("この注文レコードを削除しますか？この操作は元に戻せません。")) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        const data = await res.json();
        alert("削除に失敗しました: " + (data.error || "不明なエラー"));
      }
    } finally {
      setProcessing(false);
    }
  }, []);

  const handleSaveOrder = useCallback(async (order: Order) => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name: order.contact_name,
          contact_email: order.contact_email,
          amount: order.amount,
          product_name: order.product_name,
          paid_at: order.paid_at,
          memo: order.memo,
          status: order.status,
        }),
      });
      if (res.ok) {
        setEditingOrder(null);
        setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, ...order } : o));
      } else {
        const data = await res.json();
        alert("保存に失敗しました: " + (data.error || "不明なエラー"));
      }
    } finally {
      setProcessing(false);
    }
  }, []);

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
        key: "installment",
        label: "分割",
        width: 70,
        render: (r) => r.installment_total && r.installment_total > 1
          ? `${r.installment_index || 1}/${r.installment_total}`
          : "-",
        sortValue: (r) => r.installment_total || 0,
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
        render: (r) => (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ORDER_STATUS_STYLES[r.status] || ""}`}>
            {ORDER_STATUS_LABELS[r.status] || r.status || "-"}
          </span>
        ),
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
      {
        key: "actions",
        label: "",
        width: 80,
        render: (r) => (
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setEditingOrder({ ...r }); }}
              className="px-1.5 py-0.5 text-[10px] text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
              title="編集"
            >
              編集
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteOrder(r.id); }}
              disabled={processing}
              className="px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
              title="削除"
            >
              削除
            </button>
          </div>
        ),
      },
    ],
    [handleDeleteOrder, processing]
  );

  const reconColumns: SpreadsheetColumn<ReconciliationItem>[] = useMemo(
    () => [
      {
        key: "customer_name",
        label: "顧客名",
        width: 160,
        render: (r) => (
          <Link
            href={`/customers/${r.customer_id}`}
            className="text-brand hover:underline"
          >
            {r.customer_name}
          </Link>
        ),
        sortValue: (r) => r.customer_name,
      },
      {
        key: "application_date",
        label: "申込日",
        width: 110,
        render: (r) => formatDate(r.application_date),
        sortValue: (r) => r.application_date || "",
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
        {unmatchedCount > 0 && (
          <Link
            href="/orders/unmatched"
            className="px-3 py-1.5 bg-red-500/20 text-red-400 text-xs rounded-lg hover:bg-red-500/30 transition-colors"
          >
            未マッチ {unmatchedCount}件を管理
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

      {/* 編集モーダル */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditingOrder(null)}>
          <div className="bg-surface-card border border-white/10 rounded-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-white font-bold">注文を編集</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400">顧客名</label>
                <input
                  value={editingOrder.contact_name || ""}
                  onChange={(e) => setEditingOrder({ ...editingOrder, contact_name: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 bg-surface-elevated border border-white/10 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">メール</label>
                <input
                  value={editingOrder.contact_email || ""}
                  onChange={(e) => setEditingOrder({ ...editingOrder, contact_email: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 bg-surface-elevated border border-white/10 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">金額</label>
                <input
                  type="number"
                  value={editingOrder.amount}
                  onChange={(e) => setEditingOrder({ ...editingOrder, amount: parseInt(e.target.value) || 0 })}
                  className="w-full mt-1 px-3 py-1.5 bg-surface-elevated border border-white/10 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">商品名</label>
                <input
                  value={editingOrder.product_name || ""}
                  onChange={(e) => setEditingOrder({ ...editingOrder, product_name: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 bg-surface-elevated border border-white/10 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">決済日</label>
                <input
                  type="date"
                  value={editingOrder.paid_at ? editingOrder.paid_at.slice(0, 10) : ""}
                  onChange={(e) => setEditingOrder({ ...editingOrder, paid_at: e.target.value || null })}
                  className="w-full mt-1 px-3 py-1.5 bg-surface-elevated border border-white/10 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">ステータス</label>
                <select
                  value={editingOrder.status || "paid"}
                  onChange={(e) => setEditingOrder({ ...editingOrder, status: e.target.value as Order["status"] })}
                  className="w-full mt-1 px-3 py-1.5 bg-surface-elevated border border-white/10 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value="paid">入金済</option>
                  <option value="scheduled">支払予定</option>
                  <option value="pending">未入金</option>
                  <option value="partial">一部入金</option>
                  <option value="refunded">返金済</option>
                  <option value="cancelled">キャンセル</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">メモ</label>
                <textarea
                  value={editingOrder.memo || ""}
                  onChange={(e) => setEditingOrder({ ...editingOrder, memo: e.target.value })}
                  rows={2}
                  className="w-full mt-1 px-3 py-1.5 bg-surface-elevated border border-white/10 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingOrder(null)}
                className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleSaveOrder(editingOrder)}
                disabled={processing}
                className="px-4 py-1.5 bg-brand text-white text-sm rounded-lg hover:bg-brand/80 disabled:opacity-50 transition-colors"
              >
                {processing ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
