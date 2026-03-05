import { createAdminClient } from "@/lib/supabase/admin";
import { StudentsAdminClient } from "./students-admin-client";

export const dynamic = "force-dynamic";

export default async function StudentsAdminPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <StudentsAdminClient students={[]} invitations={[]} />;
  }

  const admin = createAdminClient();

  // LMSアカウント一覧
  const { data: roles } = await admin
    .from("user_roles")
    .select("id, user_id, role, customer_id, created_at")
    .order("created_at", { ascending: false });

  const { data: customers } = await admin
    .from("customers")
    .select("id, name, email");

  const students = [];
  if (roles) {
    for (const role of roles as { id: string; user_id: string; role: string; customer_id: string | null; created_at: string }[]) {
      const { data: userData } = await admin.auth.admin.getUserById(role.user_id);
      const customer = (customers as { id: string; name: string; email: string | null }[] | null)?.find((c) => c.id === role.customer_id);
      students.push({
        id: role.id,
        user_id: role.user_id,
        email: userData?.user?.email || "不明",
        role: role.role,
        customer_id: role.customer_id,
        customer_name: customer?.name || null,
        created_at: role.created_at,
      });
    }
  }

  // 招待一覧（全ロール）
  const { data: invitations } = await admin
    .from("invitations")
    .select("id, email, display_name, role, token, expires_at, used_at, customer_id, created_at")
    .order("created_at", { ascending: false });

  return (
    <StudentsAdminClient
      students={students}
      invitations={(invitations as any[]) || []}
    />
  );
}
