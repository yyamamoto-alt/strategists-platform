import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { FormDataClient } from "./form-data-client";

export const dynamic = "force-dynamic";

export interface FormRecord {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  source: string;
  raw_data: Record<string, string>;
  applied_at: string;
}

async function fetchFormData(): Promise<FormRecord[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Supabaseのデフォルトrow limitは1000件。全件取得するためにページネーション
  let allData: Record<string, unknown>[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error: pageError } = await db
      .from("application_history")
      .select(`
        id,
        customer_id,
        source,
        raw_data,
        applied_at,
        customers ( name )
      `)
      .order("applied_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (pageError || !page || page.length === 0) {
      if (pageError) console.error("application_history fetch error:", pageError);
      hasMore = false;
    } else {
      allData = allData.concat(page);
      from += PAGE_SIZE;
      if (page.length < PAGE_SIZE) hasMore = false;
    }
  }

  const data = allData;
  const error = null;

  if (error) {
    console.error("application_history fetch error:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    customer_id: row.customer_id as string | null,
    customer_name:
      (row.customers as { name: string } | null)?.name ?? null,
    source: row.source as string,
    raw_data: (row.raw_data || {}) as Record<string, string>,
    applied_at: row.applied_at as string,
  }));
}

export default async function FormDataPage() {
  const records = await fetchFormData();
  return <FormDataClient records={records} />;
}
