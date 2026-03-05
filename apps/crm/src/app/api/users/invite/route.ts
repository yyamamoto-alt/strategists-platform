import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { email, display_name, role } = await request.json();

  if (!email) {
    return NextResponse.json(
      { error: "メールアドレスは必須です" },
      { status: 400 }
    );
  }

  if (!role || !["admin", "mentor"].includes(role)) {
    return NextResponse.json(
      { error: "ロールは admin または mentor を指定してください" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // トークン生成
  const token = crypto.randomUUID();

  // 有効期限: 7日後
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // 招待レコード作成
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("invitations") as any).insert({
    email,
    display_name: display_name || null,
    role,
    token,
    expires_at: expiresAt.toISOString(),
    source: "crm",
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
