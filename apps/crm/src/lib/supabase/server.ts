import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@strategy-school/shared-db";

// CRM専用: service role key でデータ取得（RLSバイパス）
// このモジュールは server-only のため、クライアントバンドルには含まれない
export function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
