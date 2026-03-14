import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { AssignmentsClient } from "./assignments-client";

export const dynamic = "force-dynamic";

async function fetchAssignments(userEmail: string | null) {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  let query = db
    .from("application_history")
    .select("id, source, raw_data, applied_at, customer_id, customers ( name )")
    .eq("source", "課題提出")
    .order("applied_at", { ascending: false });

  // userEmailがある場合、raw_data->>'メールアドレス' でサーバー側フィルタ
  if (userEmail) {
    query = query.eq("raw_data->>メールアドレス", userEmail);
    query = query.limit(200);
  } else {
    query = query.limit(1000);
  }

  const { data, error } = await query;

  if (error) {
    console.error("assignments fetch error:", error);
    return [];
  }

  // ログインユーザーのメールアドレスでフィルタリング
  const filtered = userEmail
    ? (data || []).filter((row: Record<string, unknown>) => {
        const raw = (row.raw_data || {}) as Record<string, string>;
        return raw["メールアドレス"]?.toLowerCase() === userEmail.toLowerCase();
      })
    : data || [];

  return filtered.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    customer_name: (row.customers as { name: string } | null)?.name ?? null,
    raw_data: (row.raw_data || {}) as Record<string, string>,
    applied_at: row.applied_at as string,
  }));
}

export default async function AssignmentsLmsPage() {
  const session = await getLmsSession();
  const isAdmin = session?.role === "admin" || session?.role === "mentor";
  // 管理者はテスト用アカウントのデータを表示、受講生は自分のデータのみ
  const userEmail = isAdmin
    ? "erika.ohbayashi@gmail.com"
    : session?.user?.email || null;
  const assignments = await fetchAssignments(userEmail);
  return <AssignmentsClient assignments={assignments} isAdmin={isAdmin} />;
}
