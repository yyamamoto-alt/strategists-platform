import { NextResponse } from "next/server";
import { matchCustomer } from "@/lib/customer-matching";
import { upsertOrder } from "@/lib/data/orders";
import {
  normalizeStripePayment,
  normalizeAppsPayment,
  normalizeFreeeTransaction,
} from "@/lib/order-normalizers";
import { sendSlackMessage } from "@/lib/slack";
import type { Order } from "@strategy-school/shared-db";

/** 銀行振込（freee）Slack通知 — Zapier ID 305870352 準拠 */
const PAYMENT_SUCCESS_CHANNEL = "C094YLMKR4K";
async function notifyBankTransfer(normalized: Partial<Order>, matched: boolean, customerUrl?: string) {
  const name = normalized.contact_name || "不明";
  const amount = normalized.amount ? normalized.amount.toLocaleString() : "不明";
  const date = normalized.paid_at
    ? new Date(normalized.paid_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    : "不明";

  const lines = [
    `:tada: *成約おめでとうございます！* :tada:`,
    `*名前：* ${name}`,
    `*金額：* ${amount}円`,
    `*日時：* ${date}`,
    matched ? "✅ 顧客マッチ済み" : "⚠️ 未マッチ",
  ];
  if (customerUrl) lines.push(customerUrl);

  await sendSlackMessage(PAYMENT_SUCCESS_CHANNEL, lines.join("\n"), {
    username: "営業勝ち取った君",
  });
}

/**
 * POST /api/orders/ingest
 * Headers: x-api-key: <INGEST_API_KEY>
 * body: { source: "stripe"|"apps"|"freee", payload: {...} }
 * → ソース別ノーマライズ → 税金計算 → 顧客マッチング → upsertOrder()
 */
export async function POST(request: Request) {
  // APIキー認証
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.INGEST_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

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

  // 銀行振込（freee）の場合はSlack通知 — Zapier準拠
  if (source === "freee") {
    try {
      const customerUrl = match
        ? `https://strategists-crm.vercel.app/customers/${match.customer_id}`
        : undefined;
      await notifyBankTransfer(normalized, !!match, customerUrl);
    } catch (e) {
      console.error("Bank transfer Slack notification failed:", e);
    }
  }

  return NextResponse.json({
    order: result,
    matched: !!match,
    match_type: match?.match_type || null,
  });
}
