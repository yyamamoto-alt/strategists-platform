import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@strategy-school/shared-db";

// 認証セッション検証用（anon key + cookies）
// middleware / login / layout からのみ使用
export async function createAuthClient() {
  const cookieStore = await cookies();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables"
    );
  }

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component からの呼び出し時は set が使えない場合がある
        }
      },
    },
  });
}

export async function getSession() {
  const supabase = await createAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // user_roles テーブルからロール + 権限を取得
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role, allowed_pages, data_months_limit, mask_pii")
    .eq("user_id", user.id)
    .single() as { data: { role: string; allowed_pages: string[] | null; data_months_limit: number | null; mask_pii: boolean } | null };

  return {
    user: { id: user.id, email: user.email || "" },
    role: (roleData?.role as "admin" | "mentor" | "student") || null,
    permissions: roleData ? {
      allowed_pages: roleData.allowed_pages || [],
      data_months_limit: roleData.data_months_limit,
      mask_pii: roleData.mask_pii ?? false,
    } : null,
  };
}
