import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache, revalidateTag } from "next/cache";
import type { Order } from "@strategy-school/shared-db";

// ================================================================
// 税金計算ヘルパー
// ================================================================

const TAX_BOUNDARY = "2026-04-01";

export function calcTaxFields(amount: number, paidAt: string | null) {
  if (!paidAt || paidAt < TAX_BOUNDARY) {
    return { amount_excl_tax: amount, tax_amount: 0, tax_rate: 0 };
  }
  const excl = Math.floor((amount * 100) / 110);
  return { amount_excl_tax: excl, tax_amount: amount - excl, tax_rate: 0.1 };
}

// ================================================================
// フェッチ系
// ================================================================

async function fetchOrdersRaw(): Promise<Order[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("orders")
    .select("*")
    .order("paid_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch orders:", error);
    return [];
  }

  return data as Order[];
}

export const fetchOrders = unstable_cache(fetchOrdersRaw, ["orders"], {
  revalidate: 60,
});

export async function fetchOrdersByCustomer(
  customerId: string
): Promise<Order[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("customer_id", customerId)
    .order("paid_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch orders for customer:", error);
    return [];
  }

  return data as Order[];
}

async function fetchUnmatchedOrdersRaw(): Promise<Order[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("match_status", "unmatched")
    .order("paid_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch unmatched orders:", error);
    return [];
  }

  return data as Order[];
}

export const fetchUnmatchedOrders = unstable_cache(
  fetchUnmatchedOrdersRaw,
  ["unmatched-orders"],
  { revalidate: 60, tags: ["orders"] }
);

// ================================================================
// Upsert（冪等: UNIQUE(source, source_record_id) を活用）
// ================================================================

export async function upsertOrder(
  order: Partial<Order> & { source: string; source_record_id: string }
) {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("orders")
    .upsert(order, {
      onConflict: "source,source_record_id",
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to upsert order:", error);
    return null;
  }

  // キャッシュ無効化 → 注文一覧に即反映
  revalidateTag("orders");

  return data as Order;
}

// ================================================================
// 突合レポート: 確定売上(orders paid+partial+scheduled) vs 入金済(orders paid)
// ================================================================

export interface ReconciliationItem {
  customer_id: string;
  customer_name: string;
  application_date: string | null;
  contract_confirmed: number;
  orders_total: number;
  difference: number;
}

async function fetchReconciliationReportRaw(): Promise<
  ReconciliationItem[]
> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 全注文（顧客紐付け済み）を取得
  const { data: orders } = await db
    .from("orders")
    .select("customer_id, amount, status")
    .not("customer_id", "is", null);

  // 顧客名・申込日の取得
  const { data: customers } = await db
    .from("customers")
    .select("id, name, application_date");

  if (!orders || !customers) return [];

  const customerMap = new Map<string, { name: string; application_date: string | null }>();
  for (const c of customers) {
    customerMap.set(c.id, { name: c.name || "不明", application_date: c.application_date || null });
  }

  // 確定売上（paid + partial + scheduled）をマップ
  const confirmedMap = new Map<string, number>();
  // 入金済み合計（paid のみ）をマップ
  const paidMap = new Map<string, number>();

  for (const o of orders) {
    if (!o.customer_id) continue;
    const amt = o.amount || 0;
    if (o.status === "paid" || o.status === "partial" || o.status === "scheduled") {
      confirmedMap.set(o.customer_id, (confirmedMap.get(o.customer_id) || 0) + amt);
    }
    if (o.status === "paid") {
      paidMap.set(o.customer_id, (paidMap.get(o.customer_id) || 0) + amt);
    }
  }

  const results: ReconciliationItem[] = [];

  for (const entry of Array.from(confirmedMap.entries()) as [string, number][]) {
    const id = entry[0];
    const confirmed = entry[1];
    const paid = paidMap.get(id) || 0;
    const diff = confirmed - paid;

    if (diff !== 0) {
      const cust = customerMap.get(id);
      results.push({
        customer_id: id,
        customer_name: cust?.name || "不明",
        application_date: cust?.application_date || null,
        contract_confirmed: confirmed,
        orders_total: paid,
        difference: diff,
      });
    }
  }

  results.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  return results;
}

export const fetchReconciliationReport = unstable_cache(
  fetchReconciliationReportRaw,
  ["reconciliation-report"],
  { revalidate: 60, tags: ["orders"] }
);

// ================================================================
// 売掛金（月別入金予定）
// ================================================================

export interface AccountsReceivableMonth {
  /** "2026-03" 形式 */
  month: string;
  /** "2026年3月" 形式 */
  label: string;
  /** 合計金額 */
  amount: number;
  /** 件数 */
  count: number;
  /** 明細 */
  items: {
    id: string;
    customer_name: string | null;
    product_name: string | null;
    amount: number;
    paid_at: string | null;
    status: string;
  }[];
}

export interface AccountsReceivableSummary {
  totalAmount: number;
  totalCount: number;
  months: AccountsReceivableMonth[];
}

async function fetchAccountsReceivableRaw(): Promise<AccountsReceivableSummary> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 未入金の注文（scheduled, pending, partial）を取得
  const { data: orders } = await db
    .from("orders")
    .select("id, customer_id, product_name, amount, paid_at, status, contact_name")
    .in("status", ["scheduled", "pending", "partial"])
    .order("paid_at", { ascending: true });

  if (!orders || orders.length === 0) {
    return { totalAmount: 0, totalCount: 0, months: [] };
  }

  // 顧客名の取得
  const customerIds = [...new Set(
    orders.filter((o: { customer_id: string | null }) => o.customer_id).map((o: { customer_id: string }) => o.customer_id)
  )];
  const customerMap = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers } = await db
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    if (customers) {
      for (const c of customers) {
        customerMap.set(c.id, c.name || "不明");
      }
    }
  }

  // 月別にグルーピング
  const monthMap = new Map<string, AccountsReceivableMonth>();

  for (const o of orders) {
    const paidAt = o.paid_at as string | null;
    let monthKey: string;
    let monthLabel: string;

    if (paidAt) {
      const d = new Date(paidAt);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      monthKey = `${y}-${String(m).padStart(2, "0")}`;
      monthLabel = `${y}年${m}月`;
    } else {
      monthKey = "9999-99";
      monthLabel = "日付未定";
    }

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { month: monthKey, label: monthLabel, amount: 0, count: 0, items: [] });
    }

    const entry = monthMap.get(monthKey)!;
    const amt = o.amount || 0;
    entry.amount += amt;
    entry.count += 1;
    entry.items.push({
      id: o.id,
      customer_name: (o.customer_id ? customerMap.get(o.customer_id) : null) || o.contact_name || null,
      product_name: o.product_name,
      amount: amt,
      paid_at: paidAt,
      status: o.status,
    });
  }

  const months = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  const totalAmount = months.reduce((sum, m) => sum + m.amount, 0);
  const totalCount = months.reduce((sum, m) => sum + m.count, 0);

  return { totalAmount, totalCount, months };
}

export const fetchAccountsReceivable = unstable_cache(
  fetchAccountsReceivableRaw,
  ["accounts-receivable"],
  { revalidate: 60, tags: ["orders"] }
);
