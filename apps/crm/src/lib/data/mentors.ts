import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export interface MentorAssignment {
  id: string;
  role: "primary" | "sub";
  assigned_at: string;
  mentor: {
    id: string;
    name: string;
    line_url: string | null;
    booking_url: string | null;
  };
}

/**
 * 顧客IDからメンター割り当て情報を取得
 * customer_id → user_roles.customer_id で user_id を取得 → student_mentors → mentors
 */
export async function fetchMentorsByCustomerId(
  customerId: string
): Promise<MentorAssignment[]> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 1. user_roles から customer_id に紐づく user_id を取得
  const { data: userRole, error: userRoleError } = await db
    .from("user_roles")
    .select("user_id")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (userRoleError) {
    console.error("Failed to fetch user_role for customer:", userRoleError);
    return [];
  }

  if (!userRole?.user_id) {
    // user_rolesにマッピングがない場合は空配列
    return [];
  }

  // 2. student_mentors からアクティブなメンター割り当てを取得
  const { data: assignments, error: assignmentError } = await db
    .from("student_mentors")
    .select("id, role, assigned_at, mentor_id")
    .eq("user_id", userRole.user_id)
    .eq("is_active", true)
    .order("role", { ascending: true }); // primary が先

  if (assignmentError) {
    console.error("Failed to fetch student_mentors:", assignmentError);
    return [];
  }

  if (!assignments || assignments.length === 0) {
    return [];
  }

  // 3. mentors テーブルからメンター情報を取得
  const mentorIds = assignments.map((a: { mentor_id: string }) => a.mentor_id);
  const { data: mentors, error: mentorError } = await db
    .from("mentors")
    .select("id, name, line_url, booking_url")
    .in("id", mentorIds);

  if (mentorError) {
    console.error("Failed to fetch mentors:", mentorError);
    return [];
  }

  const mentorMap = new Map<string, { id: string; name: string; line_url: string | null; booking_url: string | null }>();
  if (mentors) {
    for (const m of mentors) {
      mentorMap.set(m.id, m);
    }
  }

  // 4. 結合して返す
  return assignments
    .map((a: { id: string; role: "primary" | "sub"; assigned_at: string; mentor_id: string }) => {
      const mentor = mentorMap.get(a.mentor_id);
      if (!mentor) return null;
      return {
        id: a.id,
        role: a.role,
        assigned_at: a.assigned_at,
        mentor,
      };
    })
    .filter((a: MentorAssignment | null): a is MentorAssignment => a !== null);
}
