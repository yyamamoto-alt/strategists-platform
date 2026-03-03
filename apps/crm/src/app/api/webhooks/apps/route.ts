import { NextResponse } from "next/server";
import { matchCustomer } from "@/lib/customer-matching";
import { upsertOrder } from "@/lib/data/orders";
import { normalizeAppsPayment } from "@/lib/order-normalizers";
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

  // Upsert（冪等）
  const result = await upsertOrder(
    normalized as Partial<Order> & { source: string; source_record_id: string }
  );

  if (!result) {
    return NextResponse.json({ error: "Failed to upsert order" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    order_id: result.id,
    matched: !!match,
    match_type: match?.match_type || null,
  });
}
