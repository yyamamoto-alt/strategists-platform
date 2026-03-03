import { NextResponse } from "next/server";
import { matchCustomer } from "@/lib/customer-matching";
import { upsertOrder } from "@/lib/data/orders";
import {
  normalizeStripePayment,
  normalizeAppsPayment,
  normalizeFreeeTransaction,
} from "@/lib/order-normalizers";
import type { Order } from "@strategy-school/shared-db";

/**
 * POST /api/orders/ingest
 * body: { source: "stripe"|"apps"|"freee", payload: {...} }
 * → ソース別ノーマライズ → 税金計算 → 顧客マッチング → upsertOrder()
 */
export async function POST(request: Request) {
  let body: { source: string; payload: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { source, payload } = body;

  if (!source || !payload) {
    return NextResponse.json(
      { error: "source and payload are required" },
      { status: 400 }
    );
  }

  // ソース別ノーマライズ
  let normalized: Partial<Order> & {
    source: string;
    source_record_id: string;
  };

  switch (source) {
    case "stripe":
      normalized = normalizeStripePayment(payload);
      break;
    case "apps":
      normalized = normalizeAppsPayment(payload);
      break;
    case "freee":
      normalized = normalizeFreeeTransaction(payload);
      break;
    default:
      return NextResponse.json(
        { error: `Unknown source: ${source}` },
        { status: 400 }
      );
  }

  if (!normalized.source_record_id) {
    return NextResponse.json(
      { error: "Could not extract source_record_id from payload" },
      { status: 400 }
    );
  }

  // 顧客マッチング
  const match = await matchCustomer(
    normalized.contact_email,
    normalized.contact_phone
  );

  if (match) {
    normalized.customer_id = match.customer_id;
    normalized.match_status = "matched";
  } else {
    normalized.match_status = "unmatched";
  }

  // Upsert（冪等）
  const result = await upsertOrder(
    normalized as Partial<Order> & {
      source: string;
      source_record_id: string;
    }
  );

  if (!result) {
    return NextResponse.json(
      { error: "Failed to upsert order" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    order: result,
    matched: !!match,
    match_type: match?.match_type || null,
  });
}
