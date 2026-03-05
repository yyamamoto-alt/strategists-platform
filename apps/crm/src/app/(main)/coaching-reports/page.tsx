import { createServiceClient } from "@/lib/supabase/server";
import { CoachingReportsClient } from "./coaching-reports-client";

export const revalidate = 60;

export interface CoachingReport {
  id: string;
  coaching_date: string | null;
  email: string | null;
  session_number: number | null;
  mentor_name: string | null;
  cancellation: string | null;
  level_fermi: string | null;
  level_case: string | null;
  level_mck: string | null;
  customer_id: string | null;
  customer_name: string | null;
}

async function fetchCoachingReports(): Promise<CoachingReport[]> {
  const supabase = createServiceClient();

  // coaching_reports と customers を LEFT JOIN して顧客名を取得
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("coaching_reports")
    .select(`
      id,
      coaching_date,
      email,
      session_number,
      mentor_name,
      cancellation,
      level_fermi,
      level_case,
      level_mck,
      customer_id,
      customers ( name )
    `)
    .order("coaching_date", { ascending: false });

  if (error) {
    console.error("coaching_reports fetch error:", error);
    return [];
  }

  // customers リレーションのデータを customer_name に変換
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    coaching_date: row.coaching_date as string | null,
    email: row.email as string | null,
    session_number: row.session_number as number | null,
    mentor_name: row.mentor_name as string | null,
    cancellation: row.cancellation as string | null,
    level_fermi: row.level_fermi as string | null,
    level_case: row.level_case as string | null,
    level_mck: row.level_mck as string | null,
    customer_id: row.customer_id as string | null,
    customer_name:
      (row.customers as { name: string } | null)?.name ?? null,
  }));
}

export default async function CoachingReportsPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <CoachingReportsClient reports={[]} />;
  }

  const reports = await fetchCoachingReports();
  return <CoachingReportsClient reports={reports} />;
}
