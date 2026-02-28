import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { email, password, name, customer_id } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードは必須です" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // 1. Supabase Auth でユーザー作成（メール確認をスキップ）
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message || "ユーザー作成に失敗しました" },
      { status: 400 }
    );
  }

  // 2. user_roles に student ロールを挿入
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: roleError } = await (supabase
    .from("user_roles") as any)
    .insert({
      user_id: authData.user.id,
      role: "student",
      customer_id: customer_id || null,
    });

  if (roleError) {
    // ロール挿入失敗時はユーザーも削除
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json(
      { error: `ロール設定に失敗しました: ${roleError.message}` },
      { status: 500 }
    );
  }

  // 3. customer_id が指定されていれば、顧客名を取得
  let customerName: string | null = null;
  if (customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("id", customer_id)
      .single() as { data: { name: string } | null };
    customerName = customer?.name || null;
  }

  return NextResponse.json({
    user: {
      id: authData.user.id,
      email: authData.user.email,
      name: name || customerName || email,
    },
    message: "学習者アカウントを作成しました",
  });
}
