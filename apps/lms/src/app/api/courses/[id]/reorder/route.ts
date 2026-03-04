import { NextRequest, NextResponse } from "next/server";
import { getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ReorderItem {
  id: string;
  sort_order: number;
  lessons?: { id: string; sort_order: number }[];
}

// PUT /api/courses/[id]/reorder — モジュール・レッスンの並び替え一括更新
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

  const { modules } = body as { modules: ReorderItem[] };

  if (!modules || !Array.isArray(modules)) {
    return NextResponse.json({ error: "modules配列は必須です" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const errors: string[] = [];

  // モジュールの sort_order 更新
  for (const mod of modules) {
    const { error: modErr } = await supabase
      .from("modules")
      .update({ sort_order: mod.sort_order } as any)
      .eq("id", mod.id)
      .eq("course_id", courseId);

    if (modErr) {
      errors.push(`module ${mod.id}: ${modErr.message}`);
      continue;
    }

    // レッスンの sort_order 更新
    if (mod.lessons) {
      for (const lesson of mod.lessons) {
        const { error: lessonErr } = await supabase
          .from("lessons")
          .update({ sort_order: lesson.sort_order, module_id: mod.id } as any)
          .eq("id", lesson.id);

        if (lessonErr) {
          errors.push(`lesson ${lesson.id}: ${lessonErr.message}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("reorder errors:", errors);
    return NextResponse.json({ error: "一部の並び替えに失敗しました", details: errors }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
