import { getLmsSession, createLmsServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/mypage - ログインユーザーの顧客情報を返す
export async function GET() {
  const session = await getLmsSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = await createLmsServerClient() as any;
  const email = session.user.email;
  const userId = session.user.id;

  // メールアドレスで顧客を検索
  const { data: customer } = await admin
    .from("customers")
    .select("id, name, email, phone, attribute, university, faculty, career_history, target_companies, target_firm_type, transfer_intent")
    .eq("email", email)
    .maybeSingle() as { data: Record<string, unknown> | null };

  if (!customer) {
    return NextResponse.json({ customer: null, contract: null, learning: null });
  }

  // 契約情報・学習情報・メンター紐付けを並列取得
  const [contractResult, learningResult, studentMentorResult] = await Promise.all([
    admin
      .from("contracts")
      .select("plan_name, contract_date")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: { plan_name: string; contract_date: string } | null }>,
    admin
      .from("learning_records")
      .select("coaching_start_date, total_sessions, remaining_sessions, mentor_name")
      .eq("customer_id", customer.id)
      .maybeSingle() as unknown as Promise<{ data: { coaching_start_date: string; total_sessions: number; remaining_sessions: number; mentor_name: string | null } | null }>,
    admin
      .from("student_mentors")
      .select("mentor_id, role")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("role", { ascending: true }) as unknown as Promise<{ data: { mentor_id: string; role: string }[] | null }>,
  ]);

  const contract = contractResult.data;
  const learning = learningResult.data;
  const studentMentorRows = studentMentorResult.data;

  // メンター情報を取得（複数メンター対応）
  type MentorInfo = { name: string; booking_url: string | null; line_url: string | null; profile_text: string | null; role: string };
  let mentors: MentorInfo[] = [];

  // 1. student_mentorsテーブルから取得（user_idベース）
  if (studentMentorRows && studentMentorRows.length > 0) {
    const mentorIds = studentMentorRows.map(r => r.mentor_id);
    const { data: mentorRecords } = await admin
      .from("mentors")
      .select("id, name, booking_url, line_url, profile_text")
      .in("id", mentorIds)
      .eq("is_active", true) as { data: { id: string; name: string; booking_url: string | null; line_url: string | null; profile_text: string | null }[] | null };

    if (mentorRecords) {
      // N+1修正: Mapで高速ルックアップ
      const mentorMap = new Map(mentorRecords.map(m => [m.id, m]));
      for (const row of studentMentorRows) {
        const rec = mentorMap.get(row.mentor_id);
        if (rec) {
          mentors.push({ name: rec.name, booking_url: rec.booking_url, line_url: rec.line_url, profile_text: rec.profile_text, role: row.role });
        }
      }
    }
  }

  // 2. フォールバック: learning_records.mentor_name or invitations.assigned_mentor_name
  if (mentors.length === 0) {
    const mentorName = learning?.mentor_name;
    let fallbackName: string | null = mentorName || null;

    if (!fallbackName) {
      const { data: invitation } = await admin
        .from("invitations")
        .select("assigned_mentor_name")
        .eq("email", email)
        .not("assigned_mentor_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as { data: { assigned_mentor_name: string } | null };
      fallbackName = invitation?.assigned_mentor_name || null;
    }

    if (fallbackName) {
      const { data: mentorData } = await admin
        .from("mentors")
        .select("name, booking_url, line_url, profile_text")
        .eq("name", fallbackName)
        .eq("is_active", true)
        .maybeSingle() as { data: { name: string; booking_url: string | null; line_url: string | null; profile_text: string | null } | null };
      const m = mentorData || { name: fallbackName, booking_url: null, line_url: null, profile_text: null };
      mentors.push({ ...m, role: "primary" });
    }
  }

  // 顧客IDは返さない（内部情報）
  const { id: _id, ...safeCustomer } = customer;

  return NextResponse.json({
    customer: safeCustomer,
    contract,
    learning,
    mentors,
  });
}
