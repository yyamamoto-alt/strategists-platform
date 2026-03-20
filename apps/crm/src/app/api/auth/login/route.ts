import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@strategy-school/shared-db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // レート制限: 5回/分（ブルートフォース防止）
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { success } = rateLimit(`crm-login:${ip}`, 5, 60_000);
  if (!success) {
    return NextResponse.json(
      { error: "ログイン試行回数の上限に達しました。1分後に再試行してください" },
      { status: 429 }
    );
  }

  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードを入力してください" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_ANON_KEY!;

  // Cookie をレスポンスに反映するためのバッファ
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

  // Supabase Auth でログイン
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが正しくありません" },
      { status: 401 }
    );
  }

  // ロール検証: admin, member, mentor のみ CRM アクセス可
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .single() as { data: { role: string } | null };

  const role = roleData?.role;
  if (role !== "admin" && role !== "member" && role !== "mentor") {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "CRMへのアクセス権限がありません" },
      { status: 403 }
    );
  }

  // レスポンスに Cookie をセット
  const response = NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
    role,
  });

  for (const cookie of cookiesToReturn) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
}
