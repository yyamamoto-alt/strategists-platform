import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { matchCustomer } from "@/lib/customer-matching";
import { upsertOrder } from "@/lib/data/orders";
import { normalizeAppsPayment } from "@/lib/order-normalizers";
import { notifyPaymentError, notifyPaymentSuccess } from "@/lib/slack";
import { logStageChange } from "@/lib/stage-audit";
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
  const secret = process.env.APPS_WEBHOOK_SECRET?.trim();

  if (!secret) {
    console.error("APPS_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  try {
    const sigBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
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

  // Upsert（冪等）
  const result = await upsertOrder(
    normalized as Partial<Order> & { source: string; source_record_id: string }
  );

  if (!result) {
    return NextResponse.json({ error: "Failed to upsert order" }, { status: 500 });
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
      // 既に受講中/成約の場合はスキップ（2回目以降の分割決済対応）
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
          changed_by: "webhook-apps",
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
        changed_by: "webhook-apps",
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

  // 分割払いの2回目以降はSlack通知をスキップ（DB保存は上で完了済み）
  const installmentIndex = normalized.installment_index as number | null;
  const installmentTotal = normalized.installment_total as number | null;
  const isSubsequentInstallment =
    installmentIndex != null && installmentTotal != null &&
    installmentIndex > 1 && installmentTotal > 1;

  // Slack通知（初回決済 or 一括決済のみ）
  const event = (payload.event as string) || "";
  if (event === "payment_error") {
    const errName = normalized.contact_name || "不明";
    const plan = normalized.product_name || "不明";
    const card = normalized.card_last4 ? `*${normalized.card_last4}` : "不明";
    const errorMsg = (payload.message as string) || "";
    const customerUrl = match
      ? `https://strategists-crm.vercel.app/customers/${match.customer_id}`
      : null;

    await notifyPaymentError(
      `🚨 決済エラー: ${errName}\n商品: ${plan}\nカード: ${card}\n${errorMsg}${customerUrl ? `\n${customerUrl}` : ""}`
    );
  } else if (!isSubsequentInstallment) {
    // 決済成功通知 — メール・カード情報も付加
    const cardInfo = normalized.card_brand && normalized.card_last4
      ? `${normalized.card_brand} *${normalized.card_last4}`
      : normalized.card_last4 ? `*${normalized.card_last4}` : undefined;
    await notifyPaymentSuccess({
      source: "Apps",
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
  }

  revalidateTag("orders");
  revalidateTag("customers");
  revalidateTag("dashboard");

  return NextResponse.json({
    success: true,
    order_id: result.id,
    matched: !!match,
    match_type: match?.match_type || null,
  });
}
