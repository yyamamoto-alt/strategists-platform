import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { token, email, password } = await request.json();

  if (!token || !email || !password) {
    return NextResponse.json(
      { error: "トークン、メールアドレス、パスワードは必須です" },
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
        email: string | null;
        display_name: string | null;
        role: string;
        token: string;
        expires_at: string;
        used_at: string | null;
        allowed_pages: string[] | null;
        data_months_limit: number | null;
        mask_pii: boolean;
        can_edit_customers: boolean;
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
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    // 既にユーザーが存在する場合 → パスワード更新で対応
    if (authError.message.includes("already") || authError.message.includes("exists")) {
      let existingUser: { id: string; email?: string } | undefined;
      let page = 1;
      const perPage = 1000;
      while (!existingUser) {
        const { data: users } = await supabase.auth.admin.listUsers({ page, perPage });
        if (!users?.users?.length) break;
        existingUser = users.users.find((u) => u.email === email);
        if (users.users.length < perPage) break;
        page++;
      }
      if (!existingUser) {
        return NextResponse.json(
          { error: "ユーザー情報の取得に失敗しました" },
          { status: 400 }
        );
      }
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
  // 表示名: 招待時の display_name があればそれ、なければメール@前
  const displayName = invitation.display_name || email.split("@")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: existingRole } = await db
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .single();

  const roleData = {
    role: invitation.role,
    display_name: displayName,
    allowed_pages: invitation.allowed_pages || [],
    data_months_limit: invitation.data_months_limit ?? null,
    mask_pii: invitation.mask_pii ?? false,
    can_edit_customers: invitation.can_edit_customers ?? true,
    is_active: true,
  };

  let roleError;
  if (existingRole) {
    ({ error: roleError } = await db
      .from("user_roles")
      .update(roleData)
      .eq("user_id", userId));
  } else {
    ({ error: roleError } = await db.from("user_roles").insert({
      user_id: userId,
      ...roleData,
    }));
  }

  if (roleError) {
    return NextResponse.json(
      { error: `ロール設定に失敗しました: ${roleError.message}` },
      { status: 500 }
    );
  }

  // 3. 招待を使用済みにマーク（レースコンディション防止: used_at IS NULL条件付き）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updatedInvite } = await (supabase.from("invitations") as any)
    .update({ used_at: new Date().toISOString(), email })
    .eq("id", invitation.id)
    .is("used_at", null)
    .select("id");

  if (!updatedInvite || updatedInvite.length === 0) {
    return NextResponse.json(
      { error: "この招待は既に使用されています" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    message: "アカウントが作成されました",
    user: {
      id: userId,
      email,
      role: invitation.role,
    },
  });
}
