import { NextRequest, NextResponse } from "next/server";
import { getLmsSession, createLmsServerClient } from "@/lib/supabase/server";

// GET /api/progress?course_id=xxx — コース内の全レッスン進捗取得
export async function GET(request: NextRequest) {
  const session = await getLmsSession();
  if (!session || !session.customerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const courseId = request.nextUrl.searchParams.get("course_id");
  if (!courseId) {
    return NextResponse.json({ error: "course_id is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createLmsServerClient() as any;

  // コースのレッスンID一覧を取得
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id")
    .eq("course_id", courseId);

  const lessonIds = (lessons || []).map((l: any) => l.id);
  if (lessonIds.length === 0) {
    return NextResponse.json([]);
  }

  const { data, error } = await supabase
    .from("lesson_progress")
    .select("lesson_id, status, started_at, completed_at")
    .eq("customer_id", session.customerId)
    .in("lesson_id", lessonIds);

  if (error) {
    console.error("progress GET error:", error);
    return NextResponse.json({ error: "Failed to fetch progress" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// POST /api/progress — 進捗を記録・更新（upsert）
export async function POST(request: NextRequest) {
  const session = await getLmsSession();
  if (!session || !session.customerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { lesson_id, status } = body;
  if (!lesson_id || !status) {
    return NextResponse.json({ error: "lesson_id and status are required" }, { status: 400 });
  }

  const validStatuses = ["未着手", "進行中", "閲覧済み", "完了"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createLmsServerClient() as any;
  const now = new Date().toISOString();

  // ステータスの降格を防ぐ（完了 → 閲覧済みへの戻りは不可）
  const statusOrder: Record<string, number> = { "未着手": 0, "進行中": 1, "閲覧済み": 2, "完了": 3 };

  // 既存レコードを確認（降格防止チェックに必要）
  const { data: existing } = await supabase
    .from("lesson_progress")
    .select("id, status")
    .eq("customer_id", session.customerId)
    .eq("lesson_id", lesson_id)
    .maybeSingle();

  if (existing && statusOrder[existing.status] >= statusOrder[status]) {
    return NextResponse.json({ status: existing.status, unchanged: true });
  }

  // upsert でSELECT→UPDATE/INSERTを1クエリに統合
  const upsertData: any = {
    customer_id: session.customerId,
    lesson_id,
    status,
    updated_at: now,
    ...(status === "完了" ? { completed_at: now } : {}),
    ...(!existing ? { started_at: now } : {}),
  };

  const { data, error } = await supabase
    .from("lesson_progress")
    .upsert(upsertData, { onConflict: "customer_id,lesson_id" })
    .select("lesson_id, status")
    .single();

  if (error) {
    console.error("progress POST error:", error);
    return NextResponse.json({ error: "Failed to update progress" }, { status: 500 });
  }

  return NextResponse.json(data);
}
