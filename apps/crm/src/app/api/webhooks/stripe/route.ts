import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { matchCustomer } from "@/lib/customer-matching";
import { upsertOrder } from "@/lib/data/orders";
import { normalizeStripePayment } from "@/lib/order-normalizers";
import { notifyPaymentSuccess } from "@/lib/slack";
import { logStageChange } from "@/lib/stage-audit";
import { createServiceClient } from "@/lib/supabase/server";
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

    try {
      const sigBuffer = Buffer.from(sig, "utf8");
      const expectedBuffer = Buffer.from(expected, "utf8");
      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        console.error("Stripe webhook: signature mismatch");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } catch {
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

  // 顧客マッチ時: sales_pipeline を「成約」に自動更新 + 受講ステータスを「受講中」に
  if (match) {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: existingPipeline } = await db
      .from("sales_pipeline")
      .select("id, stage")
      .eq("customer_id", match.customer_id)
      .maybeSingle();

    if (existingPipeline) {
      const skipStages = ["受講中", "成約"];
      if (!skipStages.includes(existingPipeline.stage)) {
        await db
          .from("sales_pipeline")
          .update({ stage: "成約", updated_at: new Date().toISOString() })
          .eq("id", existingPipeline.id);
        logStageChange({
          customer_id: match.customer_id,
          old_stage: existingPipeline.stage,
          new_stage: "成約",
          changed_by: "webhook-stripe",
        }).catch(() => {});
      }
    } else {
      await db
        .from("sales_pipeline")
        .insert({
          customer_id: match.customer_id,
          stage: "成約",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      logStageChange({
        customer_id: match.customer_id,
        old_stage: null,
        new_stage: "成約",
        changed_by: "webhook-stripe",
      }).catch(() => {});
    }

    // 受講ステータスを「受講中」に更新（Zapier COL$AN準拠 → contractsテーブル）
    const { data: contract } = await db
      .from("contracts")
      .select("id, enrollment_status")
      .eq("customer_id", match.customer_id)
      .maybeSingle();

    if (contract && contract.enrollment_status !== "受講中") {
      await db
        .from("contracts")
        .update({ enrollment_status: "受講中", updated_at: new Date().toISOString() })
        .eq("id", contract.id);
    }
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

  revalidateTag("orders");
  revalidateTag("customers");
  revalidateTag("dashboard");

  return NextResponse.json({
    success: true,
    order_id: result.id,
    matched: !!match,
  });
}
