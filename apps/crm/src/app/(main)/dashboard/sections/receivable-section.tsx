import { fetchAccountsReceivable } from "@/lib/data/orders";
import { ReceivableClient } from "./receivable-client";

export async function ReceivableSection() {
  const data = await fetchAccountsReceivable();

  return <ReceivableClient data={data} />;
}
