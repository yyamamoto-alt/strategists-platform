import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
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

export async function fetchUnmatchedOrders(): Promise<Order[]> {
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

  return data as Order;
}

// ================================================================
// 突合レポート: contracts.confirmed_amount vs SUM(orders.amount)
// ================================================================

export interface ReconciliationItem {
  customer_id: string;
  customer_name: string;
  contract_confirmed: number;
  orders_total: number;
  difference: number;
}

export async function fetchReconciliationReport(): Promise<
  ReconciliationItem[]
> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 契約情報の取得
  const { data: contracts } = await db
    .from("contracts")
    .select("customer_id, confirmed_amount");

  // 注文の顧客別合計
  const { data: orders } = await db
    .from("orders")
    .select("customer_id, amount")
    .not("customer_id", "is", null);

  // 顧客名の取得
  const { data: customers } = await db
    .from("customers")
    .select("id, name");

  if (!contracts || !orders || !customers) return [];

  const customerMap = new Map<string, string>();
  for (const c of customers) {
    customerMap.set(c.id, c.name || "不明");
  }

  // 契約の confirmed_amount をマップ
  const contractMap = new Map<string, number>();
  for (const c of contracts) {
    if (c.customer_id && c.confirmed_amount) {
      contractMap.set(
        c.customer_id,
        (contractMap.get(c.customer_id) || 0) + c.confirmed_amount
      );
    }
  }

  // 注文の合計をマップ
  const orderMap = new Map<string, number>();
  for (const o of orders) {
    if (o.customer_id) {
      orderMap.set(
        o.customer_id,
        (orderMap.get(o.customer_id) || 0) + (o.amount || 0)
      );
    }
  }

  // 全顧客IDを統合
  const allIdsArr = Array.from(contractMap.keys()).concat(Array.from(orderMap.keys()));
  const seen = new Set<string>();
  const results: ReconciliationItem[] = [];

  for (let i = 0; i < allIdsArr.length; i++) {
    const id = allIdsArr[i];
    if (seen.has(id)) continue;
    seen.add(id);
    const contractTotal = contractMap.get(id) || 0;
    const ordersTotal = orderMap.get(id) || 0;
    const diff = contractTotal - ordersTotal;

    if (diff !== 0) {
      results.push({
        customer_id: id,
        customer_name: customerMap.get(id) || "不明",
        contract_confirmed: contractTotal,
        orders_total: ordersTotal,
        difference: diff,
      });
    }
  }

  results.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  return results;
}
