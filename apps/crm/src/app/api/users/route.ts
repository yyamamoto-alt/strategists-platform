import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServiceClient();

  // user_roles 一覧を取得（権限フィールド含む）
  const { data: userRoles, error: rolesError } = await supabase
    .from("user_roles")
    .select("id, user_id, role, display_name, created_at, allowed_pages, data_months_limit, mask_pii, is_active")
    .order("created_at", { ascending: false }) as {
      data: {
        id: string;
        user_id: string;
        role: string;
        display_name: string | null;
        created_at: string;
        allowed_pages: string[] | null;
        data_months_limit: number | null;
        mask_pii: boolean;
        is_active: boolean;
      }[] | null;
      error: unknown;
    };

  if (rolesError) {
    return NextResponse.json(
      { error: "ユーザー一覧の取得に失敗しました" },
      { status: 500 }
    );
  }

  // 各ユーザーのメールアドレスを admin API で取得
  const users = [];
  if (userRoles) {
    for (const role of userRoles) {
      const { data: userData } = await supabase.auth.admin.getUserById(role.user_id);
      users.push({
        id: role.id,
        user_id: role.user_id,
        email: userData?.user?.email || "不明",
        display_name: role.display_name,
        role: role.role,
        created_at: role.created_at,
        allowed_pages: role.allowed_pages || [],
        data_months_limit: role.data_months_limit,
        mask_pii: role.mask_pii ?? false,
        is_active: role.is_active ?? true,
      });
    }
  }

  // 招待一覧を取得（CRMからの招待のみ）
  const { data: invitations, error: invError } = await supabase
    .from("invitations")
    .select("*")
    .eq("source", "crm")
    .order("created_at", { ascending: false }) as {
      data: {
        id: string;
        email: string;
        display_name: string | null;
        role: string;
        token: string;
        expires_at: string;
        used_at: string | null;
        created_at: string;
      }[] | null;
      error: unknown;
    };

  if (invError) {
    return NextResponse.json(
      { error: "招待一覧の取得に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ users, invitations: invitations || [] });
}
