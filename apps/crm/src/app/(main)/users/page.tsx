import { createServiceClient } from "@/lib/supabase/server";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = createServiceClient();

  // user_roles 一覧を取得
  const { data: rawRoles } = await supabase
    .from("user_roles")
    .select("id, user_id, role, display_name, created_at")
    .order("created_at", { ascending: false }) as {
      data: { id: string; user_id: string; role: string; display_name: string | null; created_at: string }[] | null;
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
        email: string;
        display_name: string | null;
        role: string;
        token: string;
        expires_at: string;
        used_at: string | null;
        created_at: string;
      }[] | null;
    };

  return <UsersClient userRoles={userRoles} invitations={invitations || []} />;
}
