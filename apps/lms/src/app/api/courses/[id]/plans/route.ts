import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";

// GET /api/courses/[id]/plans — コースに紐づくプランID一覧
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: courseId } = await params;
  const session = await getLmsSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("course_plan_access")
    .select("plan_id")
    .eq("course_id", courseId);

  if (error) {
    console.error("course plans GET error:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data?.map((d: any) => d.plan_id) || []);
}

// PUT /api/courses/[id]/plans — コース×プラン紐付け一括更新 (admin only)
// body: { plan_ids: string[] }  — 空配列 = 全プラン公開
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: courseId } = await params;
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

  const { plan_ids } = body;
  if (!Array.isArray(plan_ids)) {
    return NextResponse.json({ error: "plan_ids must be an array" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 既存の紐付けを全削除
  const { error: deleteError } = await supabase
    .from("course_plan_access")
    .delete()
    .eq("course_id", courseId);

  if (deleteError) {
    console.error("course plans DELETE error:", deleteError);
    return NextResponse.json({ error: "紐付け削除に失敗しました" }, { status: 500 });
  }

  // 新しい紐付けを挿入（plan_idsが空なら = 全プラン公開）
  if (plan_ids.length > 0) {
    const rows = plan_ids.map((plan_id: string) => ({
      course_id: courseId,
      plan_id,
    }));

    const { error: insertError } = await supabase
      .from("course_plan_access")
      .insert(rows);

    if (insertError) {
      console.error("course plans INSERT error:", insertError);
      return NextResponse.json({ error: "紐付け作成に失敗しました" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
