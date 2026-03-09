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

  // Stripe署名検証
  const sigHeader = request.headers.get("stripe-signature");
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (endpointSecret && sigHeader) {
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
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // charge.succeeded 以外のイベントは無視（ログだけ）
  const eventType = payload.type as string;
  if (eventType && eventType !== "charge.succeeded" && eventType !== "payment_intent.succeeded") {
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

  // Upsert
  const result = await upsertOrder(
    normalized as Partial<Order> & { source: string; source_record_id: string }
  );

  if (!result) {
    return NextResponse.json({ error: "Failed to upsert order" }, { status: 500 });
  }

  // Slack通知（決済成功）
  await notifyPaymentSuccess({
    source: "Stripe",
    name: normalized.contact_name || "不明",
    amount: normalized.amount || 0,
    product: normalized.product_name || "不明",
    matched: !!match,
    customerUrl: match
      ? `https://strategists-crm.vercel.app/customers/${match.customer_id}`
      : undefined,
  });

  return NextResponse.json({
    success: true,
    order_id: result.id,
    matched: !!match,
  });
}
