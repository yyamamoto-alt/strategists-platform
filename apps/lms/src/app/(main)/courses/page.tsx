import { getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CoursePageClient } from "./course-page-client";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
  if (useMock) {
    return <CoursePageClient courses={[]} courseDataMap={{}} forms={[]} />;
  }

  try {
    const session = await getLmsSession();
    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    const isAdmin = session?.role === "admin" || session?.role === "mentor";

    // Phase 1: コース一覧 + アクセス権 + プラン情報を並列取得
    const [
      coursesResult,
      userAccessResult,
      planAccessResult,
      contractResult,
      plansResult,
      formsResult,
      formAccessResult,
    ] = await Promise.all([
      db.from("courses").select("id, title, slug, description, category, level, duration_weeks, is_active, sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
      !isAdmin && session?.user?.id
        ? db.from("user_course_access").select("course_id").eq("user_id", session.user.id)
        : Promise.resolve({ data: null }),
      !isAdmin
        ? db.from("course_plan_access").select("course_id, plan_id")
        : Promise.resolve({ data: null }),
      session?.customerId
        ? db.from("contracts").select("plan_name").eq("customer_id", session.customerId).order("created_at", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      db.from("plans").select("id, name").eq("is_active", true),
      db.from("forms").select("id, title, url, description, sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
      db.from("form_plan_access").select("form_id, plan_id"),
    ]);

    const allCourses = (coursesResult.data || []) as any[];

    // プランID特定
    let planId: string | null = null;
    const contractData = contractResult.data as { plan_name: string } | null;
    const plans = (plansResult.data || []) as { id: string; name: string }[];
    if (contractData?.plan_name) {
      const matched = plans.find((p) =>
        contractData.plan_name.includes(p.name) || p.name.includes(contractData.plan_name)
      );
      if (matched) planId = matched.id;
    }

    // user_course_access フィルタ
    let visibleCourses = allCourses;
    if (!isAdmin && userAccessResult.data) {
      const accessIds = new Set((userAccessResult.data as { course_id: string }[]).map((a) => a.course_id));
      visibleCourses = visibleCourses.filter((c: any) => accessIds.has(c.id));
    }

    // course_plan_access フィルタ
    if (!isAdmin && planId && planAccessResult.data) {
      const allAccess = planAccessResult.data as { course_id: string; plan_id: string }[];
      const myAccessIds = new Set(allAccess.filter((a) => a.plan_id === planId).map((a) => a.course_id));
      const allPlanCourseIds = new Set(allAccess.map((a) => a.course_id));
      visibleCourses = visibleCourses.filter((c: any) =>
        !allPlanCourseIds.has(c.id) || myAccessIds.has(c.id)
      );
    }

    if (visibleCourses.length === 0) {
      return <CoursePageClient courses={[]} courseDataMap={{}} forms={[]} noAccessMessage="コースが割り当てられていません。管理者にお問い合わせください。" />;
    }

    // Phase 2: 全コースの modules + lessons + progress を一括並列取得
    const courseIds = visibleCourses.map((c: any) => c.id);

    const [modulesResult, lessonsResult, progressResult] = await Promise.all([
      db.from("modules").select("*").in("course_id", courseIds).order("sort_order", { ascending: true }),
      db.from("lessons").select("*").in("course_id", courseIds).eq("is_active", true).order("sort_order", { ascending: true }),
      session?.customerId
        ? db.from("lesson_progress").select("lesson_id, status").eq("customer_id", session.customerId)
        : Promise.resolve({ data: [] }),
    ]);

    const allModules = (modulesResult.data || []) as any[];
    const allLessons = (lessonsResult.data || []) as any[];
    const allProgress = (progressResult.data || []) as { lesson_id: string; status: string }[];

    // コースごとにデータをまとめる
    const courseDataMap: Record<string, { modules: any[]; progressMap: Record<string, string> }> = {};

    for (const course of visibleCourses) {
      const courseModules = allModules.filter((m: any) => m.course_id === course.id);
      const courseLessons = allLessons.filter((l: any) => l.course_id === course.id);

      const modulesWithLessons = courseModules.map((mod: any) => ({
        ...mod,
        lessons: courseLessons.filter((l: any) => l.module_id === mod.id),
      }));

      const progressMap: Record<string, string> = {};
      const courseLessonIds = new Set(courseLessons.map((l: any) => l.id));
      for (const p of allProgress) {
        if (courseLessonIds.has(p.lesson_id)) {
          progressMap[p.lesson_id] = p.status;
        }
      }

      courseDataMap[course.id] = { modules: modulesWithLessons, progressMap };
    }

    // フォームをプランでフィルタ
    const allForms = (formsResult.data || []) as any[];
    const allFormAccess = (formAccessResult.data || []) as { form_id: string; plan_id: string }[];
    const formAccessMap: Record<string, string[]> = {};
    for (const a of allFormAccess) {
      if (!formAccessMap[a.form_id]) formAccessMap[a.form_id] = [];
      formAccessMap[a.form_id].push(a.plan_id);
    }
    const filteredForms = isAdmin
      ? allForms
      : allForms.filter((f: any) => {
          const pids = formAccessMap[f.id] || [];
          return pids.length === 0 || (planId && pids.includes(planId));
        });

    return (
      <CoursePageClient
        courses={visibleCourses}
        courseDataMap={courseDataMap}
        forms={filteredForms}
      />
    );
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("CoursesPage error:", e);
    return <CoursePageClient courses={[]} courseDataMap={{}} forms={[]} />;
  }
}
