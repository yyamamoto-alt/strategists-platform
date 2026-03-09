import { createServiceClient } from "@/lib/supabase/server";
import { OtherRevenuesClient } from "./other-revenues-client";

export const dynamic = "force-dynamic";

export default async function OtherRevenuesPage() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: revenues } = await db
    .from("other_revenues")
    .select("*")
    .order("revenue_date", { ascending: false });

  return <OtherRevenuesClient initialData={revenues || []} />;
}
