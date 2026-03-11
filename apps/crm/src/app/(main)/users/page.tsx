import { createServiceClient } from "@/lib/supabase/server";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = createServiceClient();

  // user_roles 一覧を取得（権限フィールド含む）
  const { data: rawRoles } = await supabase
    .from("user_roles")
    .select("id, user_id, role, display_name, created_at, allowed_pages, data_months_limit, mask_pii, can_edit_customers, is_active")
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
        can_edit_customers: boolean;
        is_active: boolean;
      }[] | null;
    };

  // 各ユーザーのメールアドレスを admin API で取得
  const userRoles = [];
  if (rawRoles) {
    for (const role of rawRoles) {
      const { data: userData } = await supabase.auth.admin.getUserById(role.user_id);
      userRoles.push({
        id: role.id,
        user_id: role.user_id,
        email: userData?.user?.email || "不明",
        display_name: role.display_name,
        role: role.role,
        created_at: role.created_at,
        allowed_pages: role.allowed_pages || [],
        data_months_limit: role.data_months_limit,
        mask_pii: role.mask_pii ?? false,
        can_edit_customers: role.can_edit_customers ?? true,
        is_active: role.is_active ?? true,
      });
    }
  }

  // 招待一覧を取得
  const { data: invitations } = await supabase
    .from("invitations")
    .select("*")
    .order("created_at", { ascending: false }) as {
      data: {
        id: string;
        email: string | null;
        display_name: string | null;
        role: string;
        token: string;
        expires_at: string;
        used_at: string | null;
        created_at: string;
        allowed_pages: string[] | null;
        data_months_limit: number | null;
        mask_pii: boolean;
        can_edit_customers: boolean;
      }[] | null;
    };

  // normalize invitation fields
  const normalizedInvitations = (invitations || []).map((inv) => ({
    ...inv,
    allowed_pages: inv.allowed_pages || [],
    mask_pii: inv.mask_pii ?? false,
    can_edit_customers: inv.can_edit_customers ?? true,
  }));

  return <UsersClient userRoles={userRoles} invitations={normalizedInvitations} />;
}
