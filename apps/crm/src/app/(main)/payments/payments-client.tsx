"use client";

import { useState, useMemo } from "react";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from "@/components/spreadsheet-table";
import type { BankTransfer, Payment } from "./page";

interface PaymentsClientProps {
  bankTransfers: BankTransfer[];
  payments: Payment[];
}

type PaymentTab = "bank" | "payments";

export function PaymentsClient({ bankTransfers, payments }: PaymentsClientProps) {
  const [activeTab, setActiveTab] = useState<PaymentTab>("bank");

  const bankColumns: SpreadsheetColumn<BankTransfer>[] = useMemo(
    () => [
      { key: "transfer_date", label: "振込日", width: 100, render: (r) => formatDate(r.transfer_date), sortValue: (r) => r.transfer_date || "" },
      { key: "buyer_name", label: "購入者名", width: 160, render: (r) => r.buyer_name || "-", sortValue: (r) => r.buyer_name || "" },
      { key: "amount", label: "金額", width: 110, align: "right" as const, render: (r) => r.amount ? formatCurrency(r.amount) : "-", sortValue: (r) => r.amount || 0 },
      { key: "product", label: "商品", width: 160, render: (r) => r.product || "-" },
      { key: "list_price", label: "定価", width: 100, align: "right" as const, render: (r) => r.list_price ? formatCurrency(r.list_price) : "-", sortValue: (r) => r.list_price || 0 },
      { key: "discounted_price", label: "割引後", width: 100, align: "right" as const, render: (r) => r.discounted_price ? formatCurrency(r.discounted_price) : "-", sortValue: (r) => r.discounted_price || 0 },
      { key: "genre", label: "ジャンル", width: 100, render: (r) => r.genre || "-" },
      { key: "period", label: "期間", width: 80, render: (r) => r.period || "-" },
      { key: "email", label: "メール", width: 200, render: (r) => <span className="text-gray-400 text-xs">{r.email || "-"}</span> },
      { key: "status", label: "ステータス", width: 90, render: (r) => r.status || "-" },
    ],
    []
  );

  const paymentColumns: SpreadsheetColumn<Payment>[] = useMemo(
    () => [
      { key: "purchase_date", label: "購入日", width: 100, render: (r) => formatDate(r.purchase_date), sortValue: (r) => r.purchase_date || "" },
      { key: "customer_name", label: "顧客名", width: 160, render: (r) => r.customer_name || "-", sortValue: (r) => r.customer_name || "" },
      { key: "amount", label: "金額", width: 110, align: "right" as const, render: (r) => r.amount ? formatCurrency(r.amount) : "-", sortValue: (r) => r.amount || 0 },
      { key: "payment_type", label: "決済種別", width: 100, render: (r) => r.payment_type || "-" },
      { key: "plan_name", label: "プラン名", width: 160, render: (r) => r.plan_name || "-" },
      { key: "status", label: "ステータス", width: 90, render: (r) => r.status || "-" },
      { key: "installment_amount", label: "分割額", width: 100, align: "right" as const, render: (r) => r.installment_amount ? formatCurrency(r.installment_amount) : "-", sortValue: (r) => r.installment_amount || 0 },
      { key: "installment_count", label: "分割回数", width: 80, align: "right" as const, render: (r) => r.installment_count !== null ? `${r.installment_count}回` : "-", sortValue: (r) => r.installment_count || 0 },
      { key: "email", label: "メール", width: 200, render: (r) => <span className="text-gray-400 text-xs">{r.email || "-"}</span> },
      { key: "memo", label: "メモ", width: 180, render: (r) => r.memo || "-" },
    ],
    []
  );

  const bankTotal = useMemo(() => bankTransfers.reduce((s, r) => s + (r.amount || 0), 0), [bankTransfers]);
  const paymentTotal = useMemo(() => payments.reduce((s, r) => s + (r.amount || 0), 0), [payments]);

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-white">支払いデータベース</h1>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 max-w-lg">
        <div className="bg-surface-card rounded-xl border border-white/10 p-3">
          <p className="text-xs text-gray-500">銀行振込合計</p>
          <p className="text-lg font-bold text-white">{formatCurrency(bankTotal)}</p>
          <p className="text-xs text-gray-500">{bankTransfers.length}件</p>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-3">
          <p className="text-xs text-gray-500">決済合計</p>
          <p className="text-lg font-bold text-white">{formatCurrency(paymentTotal)}</p>
          <p className="text-xs text-gray-500">{payments.length}件</p>
        </div>
      </div>

      {/* タブ */}
      <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5 w-fit border border-white/10">
        <button
          onClick={() => setActiveTab("bank")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === "bank"
              ? "bg-brand text-white shadow-sm"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          銀行振込 ({bankTransfers.length})
        </button>
        <button
          onClick={() => setActiveTab("payments")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === "payments"
              ? "bg-brand text-white shadow-sm"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          決済 ({payments.length})
        </button>
      </div>

      {activeTab === "bank" ? (
        <SpreadsheetTable
          columns={bankColumns}
          data={bankTransfers}
          getRowKey={(r) => r.id}
          storageKey="payments-bank"
          searchPlaceholder="購入者名・商品・メールで検索..."
          searchFilter={(r, q) =>
            (r.buyer_name?.toLowerCase().includes(q) ?? false) ||
            (r.product?.toLowerCase().includes(q) ?? false) ||
            (r.email?.toLowerCase().includes(q) ?? false)
          }
        />
      ) : (
        <SpreadsheetTable
          columns={paymentColumns}
          data={payments}
          getRowKey={(r) => r.id}
          storageKey="payments-list"
          searchPlaceholder="顧客名・プラン名・メールで検索..."
          searchFilter={(r, q) =>
            (r.customer_name?.toLowerCase().includes(q) ?? false) ||
            (r.plan_name?.toLowerCase().includes(q) ?? false) ||
            (r.email?.toLowerCase().includes(q) ?? false)
          }
        />
      )}
    </div>
  );
}
