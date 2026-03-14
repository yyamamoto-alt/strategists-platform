import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { ProgressSheetsClient } from "./progress-sheets-client";

export const dynamic = "force-dynamic";

export interface MentorReport {
  id: string;
  customer_name: string | null;
  raw_data: Record<string, string>;
  applied_at: string;
  // coaching_reports から取得するレベル情報
  level_fermi: string | null;
  level_case: string | null;
  level_mck: string | null;
}

async function fetchMentorReports(userEmail: string | null): Promise<MentorReport[]> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // application_history からメンター指導報告を取得
  // userEmailがある場合、raw_data->>'顧客メールアドレス' でサーバー側フィルタ
  let reportsQuery = db
    .from("application_history")
    .select("id, source, raw_data, applied_at, customer_id, customers ( name )")
    .eq("source", "メンター指導報告")
    .order("applied_at", { ascending: false });

  if (userEmail) {
    reportsQuery = reportsQuery.eq("raw_data->>顧客メールアドレス", userEmail);
    reportsQuery = reportsQuery.limit(200);
  } else {
    reportsQuery = reportsQuery.limit(2000);
  }

  const { data: reports, error } = await reportsQuery;

  if (error) {
    console.error("mentor reports fetch error:", error);
    return [];
  }

  // coaching_reports からレベル情報を取得（メールアドレスでマッチ）
  // userEmailがある場合、サーバー側でemailフィルタ
  let coachingQuery = db
    .from("coaching_reports")
    .select("email, coaching_date, level_fermi, level_case, level_mck");

  if (userEmail) {
    coachingQuery = coachingQuery.eq("email", userEmail);
    coachingQuery = coachingQuery.limit(500);
  } else {
    coachingQuery = coachingQuery.limit(5000);
  }

  const { data: coachingData } = await coachingQuery as { data: any[] | null };

  // email + date でレベルをルックアップ
  const levelMap = new Map<string, { level_fermi: string | null; level_case: string | null; level_mck: string | null }>();
  for (const cr of coachingData || []) {
    if (cr.email && cr.coaching_date) {
      levelMap.set(`${cr.email}|${cr.coaching_date}`, {
        level_fermi: cr.level_fermi,
        level_case: cr.level_case,
        level_mck: cr.level_mck,
      });
    }
  }

  // ログインユーザーのメールアドレスでフィルタリング
  const filtered = userEmail
    ? (reports || []).filter((row: Record<string, unknown>) => {
        const raw = (row.raw_data || {}) as Record<string, string>;
        return raw["顧客メールアドレス"]?.toLowerCase() === userEmail.toLowerCase();
      })
    : reports || [];

  return filtered.map((row: Record<string, unknown>) => {
    const raw = (row.raw_data || {}) as Record<string, string>;
    const email = raw["顧客メールアドレス"] || "";
    const date = raw["指導日"] || "";
    // 日付フォーマット統一 (2025/03/03 → 2025-03-03)
    const normalizedDate = date.replace(/\//g, "-");
    const levels = levelMap.get(`${email}|${normalizedDate}`) || {
      level_fermi: null,
      level_case: null,
      level_mck: null,
    };

    return {
      id: row.id as string,
      customer_name: (row.customers as { name: string } | null)?.name ?? null,
      raw_data: raw,
      applied_at: row.applied_at as string,
      ...levels,
    };
  });
}

export default async function ProgressSheetsPage() {
  const session = await getLmsSession();
  const isAdmin = session?.role === "admin" || session?.role === "mentor";
  // 管理者はテスト用アカウントのデータを表示、受講生は自分のデータのみ
  const userEmail = isAdmin
    ? "erika.ohbayashi@gmail.com"
    : session?.user?.email || null;
  const reports = await fetchMentorReports(userEmail);
  return <ProgressSheetsClient reports={reports} isAdmin={isAdmin} />;
}
