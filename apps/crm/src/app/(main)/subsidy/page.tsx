export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { createServiceClient } from "@/lib/supabase/server";
import { SubsidyClient } from "./subsidy-client";

async function fetchFirstPaidDates(): Promise<Record<string, string>> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from("orders")
    .select("customer_id, paid_at")
    .eq("status", "paid")
    .not("customer_id", "is", null)
    .not("paid_at", "is", null)
    .order("paid_at", { ascending: true });

  const map: Record<string, string> = {};
  if (data) {
    for (const row of data) {
      if (row.customer_id && row.paid_at && !map[row.customer_id]) {
        map[row.customer_id] = row.paid_at.split("T")[0].split(" ")[0];
      }
    }
  }
  return map;
}

export default async function SubsidyPage() {
  const [customers, firstPaidMap] = await Promise.all([
    fetchCustomersWithRelations(),
    fetchFirstPaidDates(),
  ]);
  return <SubsidyClient customers={customers} firstPaidMap={firstPaidMap} />;
}
