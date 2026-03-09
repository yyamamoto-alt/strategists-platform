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

export async function fetchReconciliationReport(): Promise<
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
