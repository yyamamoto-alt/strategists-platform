import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { transformCustomerRows, transformCustomerRow } from "./transforms";
import type { CustomerWithRelations, Activity } from "@strategy-school/shared-db";

const CUSTOMER_WITH_RELATIONS_QUERY = `
  *,
  sales_pipeline (*),
  contracts (*),
  learning_records (*),
  agent_records (*)
` as const;

export async function fetchCustomersWithRelations(): Promise<
  CustomerWithRelations[]
> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_WITH_RELATIONS_QUERY)
    .order("application_date", { ascending: false });

  if (error) {
    console.error("Failed to fetch customers:", error);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return transformCustomerRows(data as any[]);
}

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
