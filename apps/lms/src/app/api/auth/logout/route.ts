import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@strategy-school/shared-db";

export async function POST() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "サーバー設定エラー" }, { status: 500 });
  }

  const cookiesToReturn: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookiesToReturn.push({ name, value, options: options as Record<string, unknown> });
        });
      },
    },
  });

  await supabase.auth.signOut();

  const response = NextResponse.json({ success: true });
  for (const cookie of cookiesToReturn) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
}
