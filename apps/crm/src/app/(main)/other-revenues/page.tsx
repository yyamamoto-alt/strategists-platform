import { createServiceClient } from "@/lib/supabase/server";
import { OtherRevenuesClient } from "./other-revenues-client";

export const dynamic = "force-dynamic";

export default async function OtherRevenuesPage() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [{ data: revenues }, { data: noteOrders }] = await Promise.all([
    db.from("other_revenues").select("*").order("revenue_date", { ascending: false }),
    db.from("orders").select("id, amount, paid_at, contact_name, product_name, order_type, source_record_id, created_at").eq("source", "note").order("paid_at", { ascending: false }),
  ]);

  return <OtherRevenuesClient initialData={revenues || []} noteOrders={noteOrders || []} />;
}
