import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { transformCustomerRows, transformCustomerRow } from "./transforms";
import type { CustomerWithRelations, Activity } from "@strategy-school/shared-db";


const CUSTOMER_WITH_RELATIONS_QUERY = `
  *,
  sales_pipeline (*),
  contracts (*),
  learning_records (*),
  agent_records (*)
` as const;

async function fetchCustomersRaw(): Promise<CustomerWithRelations[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_WITH_RELATIONS_QUERY)
    .order("application_date", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("Failed to fetch customers:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return transformCustomerRows(data as any[]);
}

/** 顧客データ取得（60秒キャッシュ） */
export const fetchCustomersWithRelations = unstable_cache(
  fetchCustomersRaw,
  ["customers"],
  { revalidate: 60, tags: ["customers"] }
);

/** orders.paid_at から顧客ごとの最初の支払日を取得 */
async function fetchFirstPaidDatesRaw(): Promise<Record<string, string>> {
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

export const fetchFirstPaidDates = unstable_cache(
  fetchFirstPaidDatesRaw,
  ["first-paid-dates"],
  { revalidate: 60, tags: ["orders"] }
);

export async function fetchCustomerById(
  id: string
): Promise<{ customer: CustomerWithRelations; activities: Activity[] } | null> {
  const supabase = createServiceClient();

  const { data: customerData, error: customerError } = await supabase
    .from("customers")
    .select(CUSTOMER_WITH_RELATIONS_QUERY)
    .eq("id", id)
    .single();

  if (customerError || !customerData) {
    console.error("Failed to fetch customer:", customerError);
    return null;
  }

  const { data: activities, error: activitiesError } = await supabase
    .from("activities")
    .select("*")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  if (activitiesError) {
    console.error("Failed to fetch activities:", activitiesError);
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customer: transformCustomerRow(customerData as any),
    activities: (activities as Activity[]) || [],
  };
}
