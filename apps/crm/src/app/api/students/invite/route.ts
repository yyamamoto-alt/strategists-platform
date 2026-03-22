import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/students/invite
 * 受講生招待URL生成（メールアドレスで顧客自動紐づけ）
 */
export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "メールアドレスは必須です" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 1. 既存のAuthユーザーチェック
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const alreadyExists = existingUsers?.users?.some((u) => u.email === email);
  if (alreadyExists) {
    return NextResponse.json({ error: "このメールアドレスのアカウントは既に存在します" }, { status: 400 });
  }

  // 2. 顧客DBからメールアドレスで自動紐づけ
  const { data: customer } = await db
    .from("customers")
    .select("id, name, email")
    .eq("email", email)
    .single();

  if (!customer) {
    // customer_emailsテーブルも検索
    const { data: altEmail } = await db
      .from("customer_emails")
      .select("customer_id")
      .eq("email", email)
      .single();

    if (!altEmail) {
      return NextResponse.json(
        { error: "この顧客メールアドレスが顧客DBに見つかりません。先に顧客を登録してください。" },
        { status: 400 }
      );
    }

    // customer_emailsから見つかった場合
    const { data: linkedCustomer } = await db
      .from("customers")
      .select("id, name")
      .eq("id", altEmail.customer_id)
      .single();

    if (!linkedCustomer) {
      return NextResponse.json({ error: "顧客データが見つかりません" }, { status: 400 });
    }

    return createInvitation(db, email, linkedCustomer.id, linkedCustomer.name);
  }

  return createInvitation(db, email, customer.id, customer.name);
}

async function createInvitation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  email: string,
  customerId: string,
  customerName: string
) {
  // 未使用の既存招待を無効化
  await db
    .from("invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("email", email)
    .is("used_at", null);

  // 招待レコード作成
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7日有効

  const { error } = await db.from("invitations").insert({
    email,
    display_name: customerName,
    role: "student",
    token,
    expires_at: expiresAt.toISOString(),
    customer_id: customerId,
  });

  if (error) {
    return NextResponse.json({ error: `招待の作成に失敗しました: ${error.message}` }, { status: 500 });
  }

  // LMSの招待URL生成
  const lmsUrl = process.env.LMS_URL || "https://strategists-lms.vercel.app";
  const inviteUrl = `${lmsUrl}/invite/${token}`;

  return NextResponse.json({
    invite_url: inviteUrl,
    customer_name: customerName,
    customer_id: customerId,
    message: "招待URLを生成しました",
  });
}
