import { createAdminClient } from "@/lib/supabase/admin";
import { AssignmentsClient } from "./assignments-client";

export const dynamic = "force-dynamic";

async function fetchAssignments() {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("application_history")
    .select("id, source, raw_data, applied_at, customer_id, customers ( name )")
    .eq("source", "課題提出")
    .order("applied_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("assignments fetch error:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    customer_name: (row.customers as { name: string } | null)?.name ?? null,
    raw_data: (row.raw_data || {}) as Record<string, string>,
    applied_at: row.applied_at as string,
  }));
}

export default async function AssignmentsLmsPage() {
  const assignments = await fetchAssignments();
  return <AssignmentsClient assignments={assignments} />;
}
