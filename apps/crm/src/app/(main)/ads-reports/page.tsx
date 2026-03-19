export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { AdsReportsClient } from "./ads-reports-client";

export default async function AdsReportsPage() {
  const supabase = createServiceClient();

  const { data: reports, error } = await (supabase as any)
    .from("ads_weekly_reports")
    .select("*")
    .order("week_start", { ascending: false });

  if (error) {
    console.error("Failed to fetch ads_weekly_reports:", error);
  }

  return <AdsReportsClient reports={reports ?? []} />;
}
