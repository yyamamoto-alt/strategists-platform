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

  const typedRoles = (roles || []) as { id: string; user_id: string; role: string; customer_id: string | null; created_at: string }[];
  const typedCustomers = (customers || []) as { id: string; name: string; email: string | null }[];

  // getUserById を並列実行で高速化
  const userDataResults = await Promise.all(
    typedRoles.map((role) => admin.auth.admin.getUserById(role.user_id))
  );

  const students = typedRoles.map((role, index) => {
    const userData = userDataResults[index]?.data;
    const customer = typedCustomers.find((c) => c.id === role.customer_id);
    return {
      id: role.id,
      user_id: role.user_id,
      email: userData?.user?.email || "不明",
      role: role.role,
      customer_id: role.customer_id,
      customer_name: customer?.name || null,
      created_at: role.created_at,
    };
  });

  // 招待一覧（LMSからの招待のみ）
  const { data: invitations } = await admin
    .from("invitations")
    .select("id, email, display_name, role, token, expires_at, used_at, customer_id, created_at, source")
    .eq("source", "lms")
    .order("created_at", { ascending: false });

  return (
    <StudentsAdminClient
      students={students}
      invitations={(invitations as any[]) || []}
    />
  );
}
