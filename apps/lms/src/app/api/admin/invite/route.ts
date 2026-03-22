import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/email";
import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/admin/invite
 * 受講生招待URL生成（管理者のみ）
 */
export async function POST(request: Request) {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, displayName, role: requestedRole, sendEmail, courseIds } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "メールアドレスは必須です" }, { status: 400 });
  }

  const role = ["admin", "mentor", "student"].includes(requestedRole) ? requestedRole : "student";

  const admin = createAdminClient();

  // 既存のAuthユーザーチェック
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const alreadyExists = existingUsers?.users?.some((u) => u.email === email);
  if (alreadyExists) {
    return NextResponse.json({ error: "このメールアドレスのアカウントは既に存在します" }, { status: 400 });
  }

  // 顧客DBから自動紐づけ（任意）
  let customerId: string | null = null;
  let customerName = displayName || null;

  const { data: customer } = await admin
    .from("customers")
    .select("id, name")
    .eq("email", email)
    .single();

  if (customer) {
    customerId = customer.id;
    customerName = customerName || customer.name;
  }

  // 未使用の既存招待を無効化
  await admin
    .from("invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("email", email)
    .is("used_at", null);

  // 招待レコード作成
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // courseIds のバリデーション
  const validCourseIds = Array.isArray(courseIds) ? courseIds.filter((id: string) => typeof id === "string" && id.length > 0) : [];

  const { error } = await admin.from("invitations").insert({
    email,
    display_name: customerName,
    role,
    token,
    expires_at: expiresAt.toISOString(),
    customer_id: customerId,
    source: "lms",
    course_ids: validCourseIds,
  });

  if (error) {
    return NextResponse.json({ error: `招待の作成に失敗しました: ${error.message}` }, { status: 500 });
  }

  const lmsUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://strategists-lms.vercel.app";
  const inviteUrl = `${lmsUrl}/invite/${token}`;

  let emailSent = false;
  let emailError: string | null = null;

  if (sendEmail) {
    try {
      await sendInviteEmail({
        to: email,
        displayName: customerName,
        role,
        inviteUrl,
        appName: "LMS",
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : "メール送信に失敗しました";
    }
  }

  return NextResponse.json({
    invite_url: inviteUrl,
    customer_name: customerName,
    customer_id: customerId,
    email_sent: emailSent,
    email_error: emailError,
  });
}
