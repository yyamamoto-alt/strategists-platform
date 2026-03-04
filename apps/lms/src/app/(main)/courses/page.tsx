import { createLmsServerClient, getLmsSession } from "@/lib/supabase/server";
import { CoursesClient } from "./courses-client";
import { mockCourses } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <CoursesClient courses={mockCourses} viewMode="portal" targetAttribute={null} modules={{}} lessons={{}} progress={{}} />;
  }

  try {
    const session = await getLmsSession();

    // コース一覧取得
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
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const supabase = createAdminClient();
        const { data: customer } = await supabase
          .from("customers")
          .select("attribute")
          .eq("id", session.customerId)
          .single() as { data: { attribute: string } | null };

        targetAttribute = customer?.attribute || null;
        if (targetAttribute === "新卒") {
          viewMode = "curriculum";
        }
      } catch (e) {
        console.error("Failed to fetch customer attribute:", e);
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
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const supabase = createAdminClient();
        const courseIds = (courses as any[]).map((c: any) => c.id);

        const { data: modules } = await supabase
          .from("modules")
          .select("*")
          .in("course_id", courseIds)
          .order("sort_order", { ascending: true });

        for (const mod of (modules || []) as any[]) {
          if (!modulesMap[mod.course_id]) modulesMap[mod.course_id] = [];
          modulesMap[mod.course_id].push(mod);
        }

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

        if (session?.customerId) {
          const { data: progressList } = await supabase
            .from("lesson_progress")
            .select("*")
            .eq("customer_id", session.customerId);

          for (const p of (progressList || []) as any[]) {
            progressMap[p.lesson_id] = p;
          }
        }
      } catch (e) {
        console.error("Failed to fetch curriculum data:", e);
        // カリキュラムデータ取得失敗 → ポータルにフォールバック
        viewMode = "portal";
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
  } catch (e) {
    console.error("CoursesPage error:", e);
    return <CoursesClient courses={[]} viewMode="portal" targetAttribute={null} modules={{}} lessons={{}} progress={{}} />;
  }
}
