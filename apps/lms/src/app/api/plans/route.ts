import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";

// GET /api/plans — プラン一覧
export async function GET() {
  const session = await getLmsSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("plans GET error:", error);
    return NextResponse.json({ error: "プラン一覧の取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data);
}
