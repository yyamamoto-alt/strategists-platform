import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createSharedSupabaseClient(
  url: string,
  anonKey: string
): SupabaseClient<Database> {
  return createClient<Database>(url, anonKey);
}
