import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getLmsSession();
  if (!session || (session.role !== "admin" && session.role !== "mentor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("mentors")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Support both single mentor and bulk array
  const mentorsInput: Array<{
    name: string;
    slack_user_id?: string | null;
    line_url?: string | null;
    booking_url?: string | null;
    profile_text?: string | null;
  }> = Array.isArray(body.mentors) ? body.mentors : [body];

  if (mentorsInput.length === 0 || !mentorsInput[0]?.name) {
    return NextResponse.json({ error: "メンター名は必須です" }, { status: 400 });
  }

  const rows = mentorsInput.map((m) => ({
    name: m.name,
    slack_user_id: m.slack_user_id || null,
    line_url: m.line_url || null,
    booking_url: m.booking_url || null,
    profile_text: m.profile_text || null,
    is_active: true,
  }));

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("mentors")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ created: data, count: data.length }, { status: 201 });
}
