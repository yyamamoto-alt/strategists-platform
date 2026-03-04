import { createClient } from "@supabase/supabase-js";

// Admin用: service_role key でRLSバイパス
// modules テーブル等の新規テーブルはDatabase型に未反映のため、型ジェネリクスなしで使用
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceKey);
}
