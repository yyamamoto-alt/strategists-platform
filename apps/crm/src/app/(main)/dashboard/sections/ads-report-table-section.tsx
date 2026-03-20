import { createServiceClient } from "@/lib/supabase/server";
import { AdsReportTableClient } from "./ads-report-table-client";

export async function AdsReportTableSection() {
  const supabase = createServiceClient();

  // 直近2週間分を取得（Google + Meta両方）
  const { data: reports, error } = await (supabase as any)
    .from("ads_weekly_reports")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(20); // 2週 × 2platform + 余裕

  if (error) {
    console.error("Failed to fetch ads_weekly_reports for dashboard:", error);
  }

  return <AdsReportTableClient reports={reports ?? []} />;
}
