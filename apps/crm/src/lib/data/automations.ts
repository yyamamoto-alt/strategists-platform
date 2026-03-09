import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

export interface Automation {
  id: string;
  name: string;
  spreadsheet_id: string;
  sheet_name: string;
  slack_channel_id: string;
  slack_channel_name: string | null;
  message_template: string | null;
  link_to_customer: boolean;
  column_mapping: Record<string, string>;
  is_active: boolean;
  last_triggered_at: string | null;
  last_synced_row: number;
  known_headers: string[];
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  automation_id: string;
  triggered_at: string;
  status: string;
  new_rows_count: number;
  notifications_sent: number;
  error_message: string | null;
  details: Record<string, unknown> | null;
}

export async function fetchAutomations(): Promise<Automation[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("automations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch automations:", error);
    return [];
  }
  return data || [];
}

export async function fetchAutomationLogs(
  automationId?: string,
  limit = 50
): Promise<AutomationLog[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  let query = db
    .from("automation_logs")
    .select("*")
    .order("triggered_at", { ascending: false })
    .limit(limit);

  if (automationId) {
    query = query.eq("automation_id", automationId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch automation logs:", error);
    return [];
  }
  return data || [];
}

export const fetchAutomationsCached = unstable_cache(
  fetchAutomations,
  ["automations"],
  { revalidate: 60 }
);
