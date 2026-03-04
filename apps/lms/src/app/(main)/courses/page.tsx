import { createLmsServerClient, getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CoursesClient } from "./courses-client";
import { mockCourses } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <CoursesClient courses={mockCourses} viewMode="portal" targetAttribute={null} modules={{}} lessons={{}} progress={{}} />;
  }

  const session = await getLmsSession();
  const supabase = createAdminClient();

  // コース一覧取得（RLSでフィルタ済み or adminは全件）
  const lmsClient = await createLmsServerClient();
  const { data: courses } = await lmsClient
    .from("courses")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  // 受講生のプラン情報を取得
  let targetAttribute: string | null = null;
  let viewMode: "curriculum" | "portal" = "portal";

  if (session?.customerId) {
    const { data: customer } = await supabase
      .from("customers")
      .select("attribute")
      .eq("id", session.customerId)
      .single() as { data: { attribute: string } | null };

    targetAttribute = customer?.attribute || null;
    if (targetAttribute === "新卒") {
      viewMode = "curriculum";
    }
  }

  // admin/mentor はデフォルトでポータルビュー
  if (session?.role === "admin" || session?.role === "mentor") {
    viewMode = "portal";
    targetAttribute = null;
  }

  // カリキュラムビューの場合: modules + lessons + progress も取得
  let modulesMap: Record<string, any[]> = {};
  let lessonsMap: Record<string, any[]> = {};
  let progressMap: Record<string, any> = {};

  if (viewMode === "curriculum" && courses && courses.length > 0) {
    const courseIds = (courses as any[]).map((c: any) => c.id);

    // modules
    const { data: modules } = await supabase
      .from("modules")
      .select("*")
      .in("course_id", courseIds)
      .order("sort_order", { ascending: true });

    for (const mod of (modules || []) as any[]) {
      if (!modulesMap[mod.course_id]) modulesMap[mod.course_id] = [];
      modulesMap[mod.course_id].push(mod);
    }

    // lessons
    const moduleIds = (modules || []).map((m: any) => m.id);
    if (moduleIds.length > 0) {
      const { data: lessons } = await supabase
        .from("lessons")
        .select("*")
        .in("module_id", moduleIds)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      for (const lesson of (lessons || []) as any[]) {
        if (!lessonsMap[lesson.module_id]) lessonsMap[lesson.module_id] = [];
        lessonsMap[lesson.module_id].push(lesson);
      }
    }

    // progress
    if (session?.customerId) {
      const { data: progressList } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("customer_id", session.customerId);

      for (const p of (progressList || []) as any[]) {
        progressMap[p.lesson_id] = p;
      }
    }
  }

  return (
    <CoursesClient
      courses={(courses as any[]) || []}
      viewMode={viewMode}
      targetAttribute={targetAttribute}
      modules={modulesMap}
      lessons={lessonsMap}
      progress={progressMap}
    />
  );
}
