import { createAdminClient } from "@/lib/supabase/admin";
import { StudentsAdminClient } from "./students-admin-client";

export const dynamic = "force-dynamic";

export default async function StudentsAdminPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <StudentsAdminClient students={[]} invitations={[]} />;
  }

  const admin = createAdminClient();

  // LMSアカウント一覧 + 顧客情報 + 招待一覧を並列取得
  const [rolesResult, customersResult, invitationsResult] = await Promise.all([
    admin
      .from("user_roles")
      .select("id, user_id, role, customer_id, created_at")
      .order("created_at", { ascending: false }),
    admin
      .from("customers")
      .select("id, name, email"),
    admin
      .from("invitations")
      .select("id, email, display_name, role, token, expires_at, used_at, customer_id, created_at, source")
      .eq("source", "lms")
      .order("created_at", { ascending: false }),
  ]);

  const typedRoles = (rolesResult.data || []) as { id: string; user_id: string; role: string; customer_id: string | null; created_at: string }[];
  const typedCustomers = (customersResult.data || []) as { id: string; name: string; email: string | null }[];

  // auth.admin.listUsers() でバッチ取得（ページネーション対応）
  const userEmailMap = new Map<string, string>();
  const perPage = 1000;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data: { users } } = await admin.auth.admin.listUsers({ page, perPage });
    for (const u of users) {
      if (u.id && u.email) {
        userEmailMap.set(u.id, u.email);
      }
    }
    hasMore = users.length === perPage;
    page++;
  }

  const customerMap = new Map(typedCustomers.map((c) => [c.id, c]));

  const students = typedRoles.map((role) => {
    const customer = role.customer_id ? customerMap.get(role.customer_id) : undefined;
    return {
      id: role.id,
      user_id: role.user_id,
      email: userEmailMap.get(role.user_id) || "不明",
      role: role.role,
      customer_id: role.customer_id,
      customer_name: customer?.name || null,
      created_at: role.created_at,
    };
  });

  return (
    <StudentsAdminClient
      students={students}
      invitations={(invitationsResult.data as any[]) || []}
    />
  );
}
