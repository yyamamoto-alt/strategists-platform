import { NextRequest, NextResponse } from "next/server";
import { getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/announcements — 全お知らせ取得（管理者専用）
export async function GET() {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("published_at", { ascending: false });

  if (error) {
    console.error("announcements GET error:", error);
    return NextResponse.json({ error: "データの取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/admin/announcements — 新規お知らせ作成
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

  const { title, content, priority, published_at } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "タイトルは必須です" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title: title.trim(),
      content: content || "",
      priority: priority || "normal",
      published_at: published_at || new Date().toISOString(),
      author_id: session.user.id,
      is_active: true,
    } as any)
    .select()
    .single();

  if (error) {
    console.error("announcements POST error:", error);
    return NextResponse.json({ error: "お知らせの作成に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
