import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { token, password } = await request.json();

  if (!token || !password) {
    return NextResponse.json(
      { error: "トークンとパスワードは必須です" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "パスワードは8文字以上にしてください" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // 招待レコードを検索
  const { data: invitation } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .single() as {
      data: {
        id: string;
        email: string;
        display_name: string | null;
        role: string;
        token: string;
        expires_at: string;
        used_at: string | null;
      } | null;
    };

  if (!invitation) {
    return NextResponse.json(
      { error: "無効な招待トークンです" },
      { status: 404 }
    );
  }

  if (invitation.used_at) {
    return NextResponse.json(
      { error: "この招待は既に使用されています" },
      { status: 400 }
    );
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "この招待の有効期限が切れています" },
      { status: 400 }
    );
  }

  // 1. Supabase Auth でユーザー作成
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message || "ユーザー作成に失敗しました" },
      { status: 400 }
    );
  }

  // 2. user_roles にロールを挿入
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: roleError } = await (supabase.from("user_roles") as any).insert({
    user_id: authData.user.id,
    role: invitation.role,
    display_name: invitation.display_name || null,
  });

  if (roleError) {
    // ロール挿入失敗時はユーザーも削除
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json(
      { error: `ロール設定に失敗しました: ${roleError.message}` },
      { status: 500 }
    );
  }

  // 3. 招待を使用済みにマーク
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("invitations") as any)
    .update({ used_at: new Date().toISOString() })
    .eq("id", invitation.id);

  return NextResponse.json({
    message: "アカウントが作成されました",
    user: {
      id: authData.user.id,
      email: authData.user.email,
      role: invitation.role,
    },
  });
}
