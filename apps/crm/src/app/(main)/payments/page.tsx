import { createServiceClient } from "@/lib/supabase/server";
import { PaymentsClient } from "./payments-client";

export const dynamic = "force-dynamic";

export interface BankTransfer {
  id: string;
  transfer_date: string | null;
  period: string | null;
  buyer_name: string | null;
  product: string | null;
  amount: number | null;
  list_price: number | null;
  discounted_price: number | null;
  genre: string | null;
  email: string | null;
  status: string | null;
  customer_id: string | null;
}

export interface Payment {
  id: string;
  purchase_date: string | null;
  customer_name: string | null;
  amount: number | null;
  payment_type: string | null;
  status: string | null;
  plan_name: string | null;
  memo: string | null;
  email: string | null;
  period: string | null;
  installment_amount: number | null;
  installment_count: number | null;
  customer_id: string | null;
}

async function fetchBankTransfers(): Promise<BankTransfer[]> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("bank_transfers")
    .select("*")
    .order("transfer_date", { ascending: false });

  if (error) {
    console.error("bank_transfers fetch error:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: (row.id as string) || "",
    transfer_date: row.transfer_date as string | null,
    period: row.period as string | null,
    buyer_name: row.buyer_name as string | null,
    product: row.product as string | null,
    amount: row.amount as number | null,
    list_price: row.list_price as number | null,
    discounted_price: row.discounted_price as number | null,
    genre: row.genre as string | null,
    email: row.email as string | null,
    status: row.status as string | null,
    customer_id: row.customer_id as string | null,
  }));
}

async function fetchPayments(): Promise<Payment[]> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("payments")
    .select("*")
    .order("purchase_date", { ascending: false });

  if (error) {
    console.error("payments fetch error:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: (row.id as string) || "",
    purchase_date: row.purchase_date as string | null,
    customer_name: row.customer_name as string | null,
    amount: row.amount as number | null,
    payment_type: row.payment_type as string | null,
    status: row.status as string | null,
    plan_name: row.plan_name as string | null,
    memo: row.memo as string | null,
    email: row.email as string | null,
    period: row.period as string | null,
    installment_amount: row.installment_amount as number | null,
    installment_count: row.installment_count as number | null,
    customer_id: row.customer_id as string | null,
  }));
}

export default async function PaymentsPage() {
  const [bankTransfers, payments] = await Promise.all([
    fetchBankTransfers(),
    fetchPayments(),
  ]);

  return (
    <PaymentsClient
      bankTransfers={bankTransfers}
      payments={payments}
    />
  );
}
