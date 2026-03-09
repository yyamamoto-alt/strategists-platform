import { NextResponse } from "next/server";
import { matchCustomer } from "@/lib/customer-matching";
import { upsertOrder } from "@/lib/data/orders";
import { normalizeStripePayment } from "@/lib/order-normalizers";
import { notifyPaymentSuccess } from "@/lib/slack";
import type { Order } from "@strategy-school/shared-db";
import crypto from "crypto";

/**
 * POST /api/webhooks/stripe
 * Stripe Webhook: charge.succeeded等のイベント
 *
 * 署名検証: stripe-signature ヘッダー
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  // Stripe署名検証（必須）
  const sigHeader = request.headers.get("stripe-signature");
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!endpointSecret || !sigHeader) {
    console.error("Stripe webhook: missing secret or signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  // Stripe の署名形式: t=timestamp,v1=signature
  const elements = sigHeader.split(",");
  const timestamp = elements.find((e) => e.startsWith("t="))?.slice(2);
  const sig = elements.find((e) => e.startsWith("v1="))?.slice(3);

  if (timestamp && sig) {
    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = crypto
      .createHmac("sha256", endpointSecret)
      .update(signedPayload)
      .digest("hex");

    if (sig !== expected) {
      console.error("Stripe webhook: signature mismatch");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    return NextResponse.json({ error: "Invalid signature format" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // charge.succeeded のみ処理。payment_intent.succeeded は無視（charge.succeeded と二重発火するため）
  const eventType = payload.type as string;
  if (eventType !== "charge.succeeded") {
    return NextResponse.json({ received: true, skipped: eventType });
  }

  // Stripe ペイロードをOrder形式にノーマライズ
  const normalized = normalizeStripePayment(payload);

  if (!normalized.source_record_id) {
    return NextResponse.json(
      { error: "Could not extract source_record_id" },
      { status: 400 }
    );
  }

  // 顧客マッチング（email, phone, nameKana, name の4引数）
  const match = await matchCustomer(
    normalized.contact_email,
    normalized.contact_phone,
    null,
    normalized.contact_name,
  );

  if (match) {
    normalized.customer_id = match.customer_id;
    normalized.match_status = "matched";
  } else {
    normalized.match_status = "unmatched";
  }

  // Upsert
  const result = await upsertOrder(
    normalized as Partial<Order> & { source: string; source_record_id: string }
  );

  if (!result) {
    return NextResponse.json({ error: "Failed to upsert order" }, { status: 500 });
  }

  // Slack通知（決済成功）— メール・カード情報も付加して特定しやすくする
  const cardInfo = normalized.card_brand && normalized.card_last4
    ? `${normalized.card_brand} *${normalized.card_last4}`
    : undefined;
  await notifyPaymentSuccess({
    source: "Stripe",
    name: normalized.contact_name || "不明",
    amount: normalized.amount || 0,
    product: normalized.product_name || "不明",
    matched: !!match,
    customerUrl: match
      ? `https://strategists-crm.vercel.app/customers/${match.customer_id}`
      : undefined,
    email: normalized.contact_email || undefined,
    cardInfo,
  });

  return NextResponse.json({
    success: true,
    order_id: result.id,
    matched: !!match,
  });
}
