import { NextRequest, NextResponse } from "next/server";
import { getLmsSession, createLmsServerClient } from "@/lib/supabase/server";

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || `course-${Date.now()}`;
}

// GET /api/courses — コース一覧
export async function GET() {
  const session = await getLmsSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createLmsServerClient();

  let query = supabase
    .from("courses")
    .select("*")
    .order("sort_order", { ascending: true });

  if (session.role !== "admin") {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("courses GET error:", error);
    return NextResponse.json({ error: "データの取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/courses — 新規コース作成
export async function POST(request: NextRequest) {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const { title, description, category, level, duration_weeks } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "コース名は必須です" }, { status: 400 });
  }

  const supabase = await createLmsServerClient();

  // slug生成（重複チェック）
  let slug = toSlug(title);
  const { data: existing } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  // sort_order: 既存最大値 + 1
  const { data: maxOrder } = await supabase
    .from("courses")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { sort_order: number } | null };

  const { data, error } = await supabase
    .from("courses")
    .insert({
      title: title.trim(),
      slug,
      description: description || null,
      category: category || null,
      level: level || "beginner",
      duration_weeks: Math.max(1, Math.min(52, Number(duration_weeks) || 12)),
      total_lessons: 0,
      is_active: false,
      sort_order: (maxOrder?.sort_order ?? 0) + 1,
      status: "draft",
    } as any)
    .select()
    .single();

  if (error) {
    console.error("courses POST error:", error);
    return NextResponse.json({ error: "コース作成に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
