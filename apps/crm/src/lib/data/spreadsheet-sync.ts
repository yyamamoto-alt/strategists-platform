import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

// ================================================================
// 型定義
// ================================================================

export interface SpreadsheetConnection {
  id: string;
  name: string;
  source_type: string;
  spreadsheet_id: string;
  sheet_name: string;
  column_mapping: Record<string, string>;
  sync_mode: string;
  last_synced_at: string | null;
  last_synced_row: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  connection_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  rows_processed: number;
  rows_created: number;
  rows_updated: number;
  rows_unmatched: number;
  error_message: string | null;
  details: Record<string, unknown> | null;
}

export interface UnmatchedRecord {
  id: string;
  sync_log_id: string | null;
  connection_id: string;
  raw_data: Record<string, unknown>;
  email: string | null;
  phone: string | null;
  name: string | null;
  status: string;
  resolved_customer_id: string | null;
  created_at: string;
}

export interface CustomerEmail {
  id: string;
  customer_id: string;
  email: string;
  is_primary: boolean;
  created_at: string;
}

export interface ApplicationHistoryRecord {
  id: string;
  customer_id: string;
  applied_at: string;
  source: string | null;
  raw_data: Record<string, unknown> | null;
  notes: string | null;
}

// ================================================================
// スプレッドシート接続
// ================================================================

async function fetchSpreadsheetConnectionsRaw(): Promise<SpreadsheetConnection[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("spreadsheet_connections")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch spreadsheet_connections:", error);
    return [];
  }

  return data as SpreadsheetConnection[];
}

export const fetchSpreadsheetConnections = unstable_cache(
  fetchSpreadsheetConnectionsRaw,
  ["spreadsheet-connections"],
  { revalidate: 60 }
);

// ================================================================
// 同期ログ
// ================================================================

export async function fetchSyncLogs(connectionId?: string): Promise<SyncLog[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  let query = db
    .from("sync_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50);

  if (connectionId) {
    query = query.eq("connection_id", connectionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch sync_logs:", error);
    return [];
  }

  return data as SyncLog[];
}

// ================================================================
// 未マッチレコード
// ================================================================

export async function fetchUnmatchedRecords(connectionId?: string): Promise<UnmatchedRecord[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  let query = db
    .from("unmatched_records")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (connectionId) {
    query = query.eq("connection_id", connectionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch unmatched_records:", error);
    return [];
  }

  return data as UnmatchedRecord[];
}

// ================================================================
// 顧客メール一覧
// ================================================================

export async function fetchCustomerEmails(customerId: string): Promise<CustomerEmail[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("customer_emails")
    .select("*")
    .eq("customer_id", customerId)
    .order("is_primary", { ascending: false });

  if (error) {
    console.error("Failed to fetch customer_emails:", error);
    return [];
  }

  return data as CustomerEmail[];
}

// ================================================================
// 申込履歴
// ================================================================

export async function fetchApplicationHistory(customerId: string): Promise<ApplicationHistoryRecord[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("application_history")
    .select("*")
    .eq("customer_id", customerId)
    .order("applied_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch application_history:", error);
    return [];
  }

  return data as ApplicationHistoryRecord[];
}
