import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { matchCustomer } from "@/lib/customer-matching";
import { upsertOrder } from "@/lib/data/orders";
import { normalizeAppsPayment } from "@/lib/order-normalizers";
import { notifyPaymentError } from "@/lib/slack";
import type { Order } from "@strategy-school/shared-db";
import crypto from "crypto";

/**
 * POST /api/webhooks/apps
 * Apps決済Webhook: 決済完了時に呼ばれる
 *
 * 署名検証: X-Apps-Signature ヘッダー (HMAC-SHA256)
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  // 署名検証
  const signature = request.headers.get("x-apps-signature") || request.headers.get("X-Apps-Signature");
  const secret = process.env.APPS_WEBHOOK_SECRET;

  if (secret && signature) {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    if (signature !== expected) {
      // デバッグ: 署名不一致でもraw_dataを保存
      const dbg = createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (dbg as any).from("unmatched_records").insert({
          raw_data: { _debug: "signature_mismatch", body: rawBody.substring(0, 500) },
        name: "apps_sig_debug",
        status: "pending",
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Apps ペイロードをOrder形式にノーマライズ
  const normalized = normalizeAppsPayment(payload);

  if (!normalized.source_record_id) {
    // source_record_id が取れない場合 → raw_dataを保存して調査可能にする
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("unmatched_records").insert({
      raw_data: payload,
      name: "apps_webhook_debug",
      status: "pending",
    });
    return NextResponse.json({
      error: "Could not extract source_record_id",
      received: true,
      payload_keys: Object.keys(payload),
    }, { status: 400 });
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
    normalized as Partial<Order> & { source: string; source_record_id: string }
  );

  if (!result) {
    return NextResponse.json({ error: "Failed to upsert order" }, { status: 500 });
  }

  // 決済エラー時のSlack通知
  const event = (payload.event as string) || "";
  if (event === "payment_error") {
    const name = normalized.contact_name || "不明";
    const plan = normalized.product_name || "不明";
    const card = normalized.card_last4 ? `*${normalized.card_last4}` : "不明";
    const errorMsg = (payload.message as string) || "";
    const customerUrl = match
      ? `https://strategists-crm.vercel.app/customers/${match.customer_id}`
      : null;

    await notifyPaymentError(
      `🚨 決済エラー: ${name}\n商品: ${plan}\nカード: ${card}\n${errorMsg}${customerUrl ? `\n${customerUrl}` : ""}`
    );
  }

  return NextResponse.json({
    success: true,
    order_id: result.id,
    matched: !!match,
    match_type: match?.match_type || null,
  });
}
