import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const {
    role,
    display_name,
    allowed_pages,
    data_months_limit,
    mask_pii,
    can_edit_customers,
  } = await request.json();

  if (!role || !["admin", "member"].includes(role)) {
    return NextResponse.json(
      { error: "ロールは admin または member を指定してください" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // トークン生成
  const token = crypto.randomUUID();

  // 有効期限: 7日後
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // 招待レコード作成（emailなし、権限設定を含む）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("invitations") as any).insert({
    email: null,
    display_name: display_name || null,
    role,
    token,
    expires_at: expiresAt.toISOString(),
    source: "crm",
    allowed_pages: role === "admin" ? [] : (allowed_pages || []),
    data_months_limit: role === "admin" ? null : (data_months_limit ?? null),
    mask_pii: role === "admin" ? false : (mask_pii ?? false),
    can_edit_customers: role === "admin" ? true : (can_edit_customers ?? true),
  });

  if (error) {
    return NextResponse.json(
      { error: `招待の作成に失敗しました: ${error.message}` },
      { status: 500 }
    );
  }

  // 招待URLを生成
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") || "http";
  const inviteUrl = `${protocol}://${host}/invite/${token}`;

  return NextResponse.json({
    message: "招待リンクを作成しました",
    invite_url: inviteUrl,
    token,
    expires_at: expiresAt.toISOString(),
  });
}
