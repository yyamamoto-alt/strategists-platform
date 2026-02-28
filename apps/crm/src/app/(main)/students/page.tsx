export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { StudentsClient } from "./students-client";

export default async function StudentsPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <StudentsClient students={[]} customers={[]} />;
  }

  const supabase = createServiceClient();

  // LMSアカウント一覧（user_roles + auth.users）
  const { data: roles } = await supabase
    .from("user_roles")
    .select("id, user_id, role, customer_id, created_at")
    .order("created_at", { ascending: false }) as {
      data: { id: string; user_id: string; role: string; customer_id: string | null; created_at: string }[] | null;
    };

  // 紐付け用の顧客一覧
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, email")
    .order("name") as {
      data: { id: string; name: string; email: string | null }[] | null;
    };

  // user_idからメールアドレスを取得
  const students = [];
  if (roles) {
    for (const role of roles) {
      const { data: userData } = await supabase.auth.admin.getUserById(role.user_id);
      const customer = customers?.find((c) => c.id === role.customer_id);
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

  return (
    <StudentsClient
      students={students}
      customers={customers?.map((c) => ({ id: c.id, name: c.name, email: c.email })) || []}
    />
  );
}
