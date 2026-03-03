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
  const amount = (payload.amount as number) || 0;
  const paidAt = (payload.paid_at as string) || (payload.purchase_date as string) || null;
  const tax = calcTaxFields(amount, paidAt);

  const planName = (payload.plan_name as string) || (payload.product_name as string) || null;
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
    status: "paid",
    payment_method: "apps",
    paid_at: paidAt,
    contact_email: (payload.email as string)?.trim().toLowerCase() || null,
    contact_name: (payload.customer_name as string) || null,
    contact_phone: (payload.phone as string) || null,
    product_name: planName,
    order_type: orderType as Order["order_type"],
    installment_total: (payload.installment_count as number) || null,
    installment_index: (payload.installment_index as number) || null,
    installment_amount: (payload.installment_amount as number) || null,
    total_price: (payload.total_price as number) || null,
    raw_data: payload as Record<string, unknown>,
  };
}

// ================================================================
// Freee 取引 → Order 正規化
// ================================================================

export function normalizeFreeeTransaction(
  payload: Record<string, unknown>
): Partial<Order> & { source: string; source_record_id: string } {
  const amount = (payload.amount as number) || 0;
  const paidAt = (payload.issue_date as string) || (payload.date as string) || null;
  const tax = calcTaxFields(amount, paidAt);

  const partnerName = (payload.partner_name as string) || null;

  return {
    source: "freee",
    source_record_id: (payload.id as string)?.toString() || "",
    amount,
    ...tax,
    status: "paid",
    payment_method: "bank_transfer",
    paid_at: paidAt,
    contact_name: partnerName,
    contact_email: null, // Freee からはメールが来ないことが多い
    product_name: (payload.description as string) || null,
    order_type: "other",
    memo: (payload.note as string) || null,
    raw_data: payload as Record<string, unknown>,
  };
}
