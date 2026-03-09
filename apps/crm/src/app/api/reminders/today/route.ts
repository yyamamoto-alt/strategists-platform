import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/reminders/today
 * Returns today's reminder targets:
 * - Sales: pipeline deals with response_date = today in active stages
 * - Mentors: mentors with coaching_end_date within next 30 days
 */
export async function GET() {
  const supabase = createServiceClient() as any;

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysLater = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];

  const activeStages = [
    "問い合わせ",
    "日程未確",
    "未実施",
    "実施済",
    "検討中",
    "長期検討",
  ];

  // Sales reminders: response_date = today AND stage in active stages
  const salesPromise = supabase
    .from("sales_pipeline")
    .select("id, customer_id, sales_person, stage, response_date, customers!inner(name)")
    .eq("response_date", today)
    .in("stage", activeStages);

  // Mentor reminders: coaching_end_date between today and today+30
  const mentorPromise = supabase
    .from("mentors")
    .select("id, mentor_name, slack_user_id, customer_id, coaching_end_date, customers!inner(name)")
    .gte("coaching_end_date", today)
    .lte("coaching_end_date", thirtyDaysLater);

  const [salesResult, mentorResult] = await Promise.all([
    salesPromise,
    mentorPromise,
  ]);

  if (salesResult.error) {
    return NextResponse.json(
      { error: `Sales query failed: ${salesResult.error.message}` },
      { status: 500 }
    );
  }

  if (mentorResult.error) {
    return NextResponse.json(
      { error: `Mentor query failed: ${mentorResult.error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    sales_reminders: salesResult.data ?? [],
    mentor_reminders: mentorResult.data ?? [],
  });
}
