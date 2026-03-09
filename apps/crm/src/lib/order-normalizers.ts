import type { Order } from "@strategy-school/shared-db";
import { calcTaxFields } from "@/lib/data/orders";

// ================================================================
// Stripe ペイメント → Order 正規化
// ================================================================

/**
 * Stripe webhook ペイロードから charge オブジェクトを抽出する。
 * - charge.succeeded: data.object が charge そのもの
 * - payment_intent.succeeded: data.object が PaymentIntent → charges.data[0] or latest_charge(展開時)
 */
function extractCharge(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const dataObj = (payload.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
  if (!dataObj) return undefined;

  const eventType = payload.type as string;

  // charge.succeeded: data.object が charge
  if (eventType === "charge.succeeded") {
    return dataObj;
  }

  // payment_intent.succeeded: data.object が PaymentIntent
  if (eventType === "payment_intent.succeeded") {
    // charges が展開されている場合（expand: ["charges"]）
    const charges = dataObj.charges as Record<string, unknown> | undefined;
    if (charges?.data && Array.isArray(charges.data) && charges.data.length > 0) {
      return charges.data[0] as Record<string, unknown>;
    }
    // latest_charge がオブジェクトとして展開されている場合
    if (dataObj.latest_charge && typeof dataObj.latest_charge === "object") {
      return dataObj.latest_charge as Record<string, unknown>;
    }
    // charge が展開されていない → PaymentIntent 自体からフォールバック
    return undefined;
  }

  // その他のイベント: data.object をそのまま返す
  return dataObj;
}

export function normalizeStripePayment(
  payload: Record<string, unknown>
): Partial<Order> & { source: string; source_record_id: string } {
  const dataObj = (payload.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
  const charge = extractCharge(payload);
  const eventType = payload.type as string;
  const isPaymentIntent = eventType === "payment_intent.succeeded";

  // PaymentIntent の場合、charge が取れなくても PaymentIntent 自体から情報を取る
  const billingDetails = (charge?.billing_details as Record<string, unknown>)
    || (isPaymentIntent && dataObj ? (dataObj.billing_details as Record<string, unknown>) : undefined)
    || {};
  const metadata = (charge?.metadata as Record<string, unknown>)
    || (dataObj?.metadata as Record<string, unknown>)
    || {};
  const cardDetails = (
    (charge?.payment_method_details as Record<string, unknown>)?.card as Record<string, unknown>
  ) || {};

  // 金額: charge.amount → PaymentIntent.amount
  const amount = (charge?.amount as number)
    || (isPaymentIntent && dataObj ? (dataObj.amount as number) : 0)
    || 0;

  // 支払い日時
  const createdTs = (charge?.created as number) || (dataObj?.created as number);
  const paidAt = createdTs ? new Date(createdTs * 1000).toISOString() : null;
  const tax = calcTaxFields(amount, paidAt);

  // 氏名: billing_details.name → metadata.customer_name → metadata.name
  const contactName = (billingDetails.name as string)
    || (metadata.customer_name as string)
    || (metadata.name as string)
    || null;

  // メール: billing_details.email → receipt_email → metadata.email
  const contactEmail = (billingDetails.email as string)
    || (charge?.receipt_email as string)
    || (dataObj?.receipt_email as string)
    || (metadata.email as string)
    || null;

  // 商品名: charge.description → PaymentIntent.description → metadata.product_name → metadata.plan_name
  const productName = (charge?.description as string)
    || (isPaymentIntent && dataObj ? (dataObj.description as string) : null)
    || (metadata.product_name as string)
    || (metadata.plan_name as string)
    || null;

  // source_record_id: charge.id → PaymentIntent.id → event.id
  const sourceRecordId = (charge?.id as string)
    || (dataObj?.id as string)
    || (payload.id as string)
    || "";

  // ステータス判定
  const status = (charge?.status === "succeeded")
    || (isPaymentIntent && dataObj?.status === "succeeded")
    ? "paid" : "pending";

  return {
    source: "stripe",
    source_record_id: sourceRecordId,
    amount,
    ...tax,
    status,
    payment_method: "credit_card",
    paid_at: paidAt,
    card_brand: (cardDetails.brand as string) || null,
    card_last4: (cardDetails.last4 as string) || null,
    contact_email: contactEmail,
    contact_name: contactName,
    product_name: productName,
    order_type: "other",
    raw_data: payload as Record<string, unknown>,
  };
}

// ================================================================
// Apps 決済 → Order 正規化
// ================================================================

export function normalizeAppsPayment(
  payload: Record<string, unknown>
): Partial<Order> & { source: string; source_record_id: string } {
  // Apps Webhook のネスト構造に対応（event: payment/refund/payment_error で構造が異なる）
  const payment = (payload.payment as Record<string, unknown>) || {};
  const customer = (payload.customer as Record<string, unknown>) || {};
  const plan = (payload.plan as Record<string, unknown>) || {};
  // カード情報: payment.card (payment/refund) or payload.card (payment_error)
  const card = (payment.card as Record<string, unknown>) || (payload.card as Record<string, unknown>) || {};
  const event = (payload.event as string) || "";

  // 金額: payment.price (割引後) or payment.original_price (元値) or フラットなamount
  const amount = (payment.price as number) || (payment.original_price as number) || (payload.amount as number) || 0;
  const paidAt = (payload.create_at as string) || (payload.paid_at as string) || (payload.purchase_date as string) || null;
  const tax = calcTaxFields(amount, paidAt);

  // ステータス: イベントタイプに応じて設定
  let status: string = "paid";
  if (event === "refund") status = "refunded";
  else if (event === "payment_error") status = "cancelled";

  // 商品名: plan.name or フラットなplan_name
  const planName = (plan.name as string) || (payload.plan_name as string) || (payload.product_name as string) || null;
  let orderType: string = "other";
  if (planName) {
    if (/ライトプラン|スタンダード|プレミアム/i.test(planName)) orderType = "main_plan";
    else if (/動画|講座/i.test(planName)) orderType = "video_course";
    else if (/追加指導|追加コーチング/i.test(planName)) orderType = "additional_coaching";
  }

  return {
    source: "apps",
    source_record_id: (payload.payment_id as string) || (payload.id as string) || "",
    source_contract_id: (payload.contract_id as string) || null,
    amount,
    ...tax,
    status: status as Order["status"],
    payment_method: "apps",
    paid_at: paidAt,
    contact_email: ((customer.email as string) || (payload.email as string))?.trim().toLowerCase() || null,
    contact_name: (customer.name as string) || (payload.name as string) || (payload.customer_name as string) || null,
    contact_phone: (customer.phone_number as string) || (payload.phone as string) || null,
    product_name: planName,
    order_type: orderType as Order["order_type"],
    card_brand: (card.brand as string) || null,
    card_last4: (card.last4 as string) || null,
    installment_total: (payload.installment_count as number) || null,
    installment_index: (payload.installment_index as number) || null,
    installment_amount: (payload.installment_amount as number) || null,
    total_price: (payload.total_price as number) || null,
    memo: event !== "payment" ? `Apps event: ${event}` : null,
    raw_data: payload as Record<string, unknown>,
  };
}

// ================================================================
// Freee 取引 → Order 正規化
// ================================================================

export function normalizeFreeeTransaction(
  payload: Record<string, unknown>
): Partial<Order> & { source: string; source_record_id: string } {
  const amount = (payload.amount as number) || (payload.due_amount as number) || 0;
  const paidAt = (payload.issue_date as string) || (payload.date as string) || null;
  const tax = calcTaxFields(amount, paidAt);

  // partner_name があればそのまま、なければ description から振込人名を抽出
  // description例: "振込  サトウ　シヨウタ" → "サトウ　シヨウタ"
  let contactName = (payload.partner_name as string) || null;
  const description = (payload.description as string) || null;
  if (!contactName && description) {
    const match = description.match(/振込\s+(.+)/);
    if (match) contactName = match[1].trim();
  }

  return {
    source: "freee",
    source_record_id: (payload.id as number | string)?.toString() || "",
    amount,
    ...tax,
    status: "paid",
    payment_method: "bank_transfer",
    paid_at: paidAt,
    contact_name: contactName,
    contact_email: null,
    product_name: description,
    order_type: "other",
    memo: (payload.note as string) || (payload.body as string) || null,
    raw_data: payload as Record<string, unknown>,
  };
}
