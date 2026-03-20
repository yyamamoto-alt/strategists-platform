import { getLmsSession, createLmsServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/notes?lesson_id=xxx — レッスンメモ取得
export async function GET(request: NextRequest) {
  const session = await getLmsSession();
  if (!session?.customerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lessonId = request.nextUrl.searchParams.get("lesson_id");
  if (!lessonId) {
    return NextResponse.json({ error: "lesson_id is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createLmsServerClient() as any;

  const { data, error } = await supabase
    .from("lesson_notes")
    .select("id, content, updated_at")
    .eq("customer_id", session.customerId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) {
    console.error("notes GET error:", error);
    return NextResponse.json({ error: "Failed to fetch note" }, { status: 500 });
  }

  return NextResponse.json(data || { content: "" });
}

// POST /api/notes — メモを保存（upsert）
export async function POST(request: NextRequest) {
  const session = await getLmsSession();
  if (!session?.customerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { lesson_id, content } = body;
  if (!lesson_id) {
    return NextResponse.json({ error: "lesson_id is required" }, { status: 400 });
  }

  if (typeof content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createLmsServerClient() as any;

  const { data, error } = await supabase
    .from("lesson_notes")
    .upsert(
      {
        customer_id: session.customerId,
        lesson_id,
        content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "customer_id,lesson_id" }
    )
    .select("id, content, updated_at")
    .single();

  if (error) {
    console.error("notes POST error:", error);
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }

  return NextResponse.json(data);
}
