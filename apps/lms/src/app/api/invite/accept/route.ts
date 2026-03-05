import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * POST /api/invite/accept
 * 招待トークンからアカウント作成（パスワード設定）
 */
export async function POST(request: Request) {
  const { token, password } = await request.json();

  if (!token || !password) {
    return NextResponse.json(
      { error: "トークンとパスワードを入力してください" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "パスワードは8文字以上にしてください" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. 招待トークン検証
  const { data: invitation, error: invErr } = await admin
    .from("invitations")
    .select("id, email, display_name, role, token, expires_at, used_at, customer_id, course_ids")
    .eq("token", token)
    .single();

  if (invErr || !invitation) {
    return NextResponse.json(
      { error: "無効な招待リンクです" },
      { status: 400 }
    );
  }

  if (invitation.used_at) {
    return NextResponse.json(
      { error: "この招待リンクは既に使用されています" },
      { status: 400 }
    );
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "この招待リンクは有効期限が切れています" },
      { status: 400 }
    );
  }

  // 2. 既存ユーザーチェック
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const alreadyExists = existingUsers?.users?.some(
    (u) => u.email === invitation.email
  );
  if (alreadyExists) {
    return NextResponse.json(
      { error: "このメールアドレスのアカウントは既に存在します。ログインしてください。" },
      { status: 400 }
    );
  }

  // 3. Authユーザー作成
  const { data: newUser, error: createErr } =
    await admin.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
    });

  if (createErr || !newUser?.user) {
    return NextResponse.json(
      { error: `アカウント作成に失敗しました: ${createErr?.message}` },
      { status: 500 }
    );
  }

  // 4. user_roles レコード作成
  await admin.from("user_roles").insert({
    user_id: newUser.user.id,
    role: invitation.role || "student",
    customer_id: invitation.customer_id || null,
  });

  // 4.5. コースアクセス権の付与
  const courseIds = Array.isArray(invitation.course_ids) ? invitation.course_ids : [];
  if (courseIds.length > 0) {
    const courseAccessRows = courseIds.map((courseId: string) => ({
      user_id: newUser.user.id,
      course_id: courseId,
    }));
    await admin.from("user_course_access").insert(courseAccessRows);
  }

  // 5. 招待を使用済みにする
  await admin
    .from("invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invitation.id);

  // 6. 自動ログイン — Cookie にセッションをセット
  const cookieStore = await cookies();
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({
      success: true,
      message: "アカウントを作成しました。ログインしてください。",
      redirect: "/login",
    });
  }

  const cookiesToReturn: {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[] = [];

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookiesToReturn.push({
            name,
            value,
            options: options as Record<string, unknown>,
          });
        });
      },
    },
  });

  const { error: loginErr } = await supabase.auth.signInWithPassword({
    email: invitation.email,
    password,
  });

  const response = NextResponse.json({
    success: true,
    message: "アカウントを作成しました",
    redirect: loginErr ? "/login" : "/courses",
  });

  for (const cookie of cookiesToReturn) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
}
