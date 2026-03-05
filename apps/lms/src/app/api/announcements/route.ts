import { NextResponse } from "next/server";
import { getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/announcements — アクティブなお知らせ取得（ログインユーザー用）
export async function GET() {
  const session = await getLmsSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, content, priority, published_at")
    .eq("is_active", true)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("announcements public GET error:", error);
    return NextResponse.json({ error: "データの取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}
