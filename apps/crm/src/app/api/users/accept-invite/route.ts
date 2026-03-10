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

  // 1. Supabase Auth でユーザー作成（既存ユーザーならパスワード更新）
  let userId: string;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
  });

  if (authError) {
    // 既にユーザーが存在する場合 → パスワード更新で対応
    if (authError.message.includes("already") || authError.message.includes("exists")) {
      // ページネーションで全ユーザーを走査（デフォルト50件制限の回避）
      let existingUser: { id: string; email?: string } | undefined;
      let page = 1;
      const perPage = 1000;
      while (!existingUser) {
        const { data: users } = await supabase.auth.admin.listUsers({ page, perPage });
        if (!users?.users?.length) break;
        existingUser = users.users.find((u) => u.email === invitation.email);
        if (users.users.length < perPage) break;
        page++;
      }
      if (!existingUser) {
        return NextResponse.json(
          { error: "ユーザー情報の取得に失敗しました" },
          { status: 400 }
        );
      }
      // パスワードを更新
      const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password,
      });
      if (updateError) {
        return NextResponse.json(
          { error: `パスワード更新に失敗しました: ${updateError.message}` },
          { status: 400 }
        );
      }
      userId = existingUser.id;
    } else {
      return NextResponse.json(
        { error: authError.message || "ユーザー作成に失敗しました" },
        { status: 400 }
      );
    }
  } else if (!authData.user) {
    return NextResponse.json(
      { error: "ユーザー作成に失敗しました" },
      { status: 400 }
    );
  } else {
    userId = authData.user.id;
  }

  // 2. user_roles にロールを挿入（既存なら更新）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: existingRole } = await db
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .single();

  let roleError;
  if (existingRole) {
    // 既存ロールを更新
    ({ error: roleError } = await db
      .from("user_roles")
      .update({
        role: invitation.role,
        display_name: invitation.display_name || null,
      })
      .eq("user_id", userId));
  } else {
    // 新規挿入
    ({ error: roleError } = await db.from("user_roles").insert({
      user_id: userId,
      role: invitation.role,
      display_name: invitation.display_name || null,
    }));
  }

  if (roleError) {
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
      id: userId,
      email: invitation.email,
      role: invitation.role,
    },
  });
}
