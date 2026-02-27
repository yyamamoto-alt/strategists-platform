import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@strategy-school/shared-db";

// LMS用: anon key + cookie-based SSR (RLSで受講生データを保護)
export async function createLmsServerClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase URL or anon key environment variables");
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

export async function getLmsSession() {
  const supabase = await createLmsServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role, customer_id")
    .eq("user_id", user.id)
    .single() as { data: { role: string; customer_id: string | null } | null };

  return {
    user: { id: user.id, email: user.email || "" },
    role: (roleData?.role as "admin" | "mentor" | "student") || null,
    customerId: roleData?.customer_id || null,
  };
}
