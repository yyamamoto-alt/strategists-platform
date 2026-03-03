import type { Order } from "@strategy-school/shared-db";
import { calcTaxFields } from "@/lib/data/orders";

// ================================================================
// Stripe ペイメント → Order 正規化
// ================================================================

export function normalizeStripePayment(
  payload: Record<string, unknown>
): Partial<Order> & { source: string; source_record_id: string } {
  const charge = (payload.data as Record<string, unknown>)?.object as Record<
    string,
    unknown
  > | undefined;

  const amount = (charge?.amount as number) || 0;
  const paidAt = charge?.created
    ? new Date((charge.created as number) * 1000).toISOString()
    : null;
  const tax = calcTaxFields(amount, paidAt);

  return {
    source: "stripe",
    source_record_id: (charge?.id as string) || (payload.id as string) || "",
    amount,
    ...tax,
    status: charge?.status === "succeeded" ? "paid" : "pending",
    payment_method: "credit_card",
    paid_at: paidAt,
    card_brand: (
      (charge?.payment_method_details as Record<string, unknown>)
        ?.card as Record<string, unknown>
    )?.brand as string | undefined || null,
    card_last4: (
      (charge?.payment_method_details as Record<string, unknown>)
        ?.card as Record<string, unknown>
    )?.last4 as string | undefined || null,
    contact_email:
      (charge?.billing_details as Record<string, unknown>)?.email as
        | string
        | null || null,
    contact_name:
      (charge?.billing_details as Record<string, unknown>)?.name as
        | string
        | null || null,
    product_name:
      (charge?.description as string) || null,
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
