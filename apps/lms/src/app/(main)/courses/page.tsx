import { createLmsServerClient, getLmsSession } from "@/lib/supabase/server";
import { CoursesClient } from "./courses-client";
import { mockCourses } from "@/lib/mock-data";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <CoursesClient courses={mockCourses} viewMode="portal" targetAttribute={null} modules={{}} lessons={{}} progress={{}} />;
  }

  try {
    const session = await getLmsSession();
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    const isAdmin = session?.role === "admin" || session?.role === "mentor";

    // ===== Phase 1: 全クエリを可能な限り並列化 =====
    const lmsClient = await createLmsServerClient();
    const coursesPromise = lmsClient
      .from("courses")
      .select("id, title, slug, description, category, level, duration_weeks, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const customerPromise = session?.customerId
      ? supabase.from("customers").select("attribute").eq("id", session.customerId).single()
      : null;
    const contractPromise = session?.customerId
      ? supabase.from("contracts").select("plan_name").eq("customer_id", session.customerId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : null;
    const plansPromise = session?.customerId
      ? supabase.from("plans").select("id, slug, name").eq("is_active", true)
      : null;

    // user_course_access と course_plan_access も最初の並列バッチに含める
    const userAccessPromise = !isAdmin && session?.user?.id
      ? supabase.from("user_course_access").select("course_id").eq("user_id", session.user.id) as unknown as Promise<{ data: { course_id: string }[] | null }>
      : null;
    const allPlanAccessPromise = !isAdmin
      ? supabase.from("course_plan_access").select("course_id, plan_id") as unknown as Promise<{ data: { course_id: string; plan_id: string }[] | null }>
      : null;

    const [coursesResult, customerResult, contractResult, plansResult, userAccessResult, allPlanAccessResult] = await Promise.all([
      coursesPromise,
      customerPromise,
      contractPromise,
      plansPromise,
      userAccessPromise,
      allPlanAccessPromise,
    ]);

    const courses = (coursesResult.data as any[]) || [];

    // ===== Phase 2: 結果を処理 =====
    let targetAttribute: string | null = null;
    let viewMode: "curriculum" | "portal" = "portal";
    let planName: string | null = null;
    let planId: string | null = null;

    if (session?.customerId) {
      const customer = (customerResult as any)?.data as { attribute: string } | null;
      targetAttribute = customer?.attribute || null;
      if (targetAttribute === "新卒") {
        viewMode = "curriculum";
      }

      const contract = (contractResult as any)?.data as { plan_name: string } | null;
      if (contract?.plan_name) {
        planName = contract.plan_name;
        const plans = (plansResult as any)?.data as any[] | null;
        if (plans) {
          const matchedPlan = plans.find((p: any) =>
            planName!.includes(p.name) || p.name.includes(planName!)
          );
          if (matchedPlan) {
            planId = matchedPlan.id;
          }
        }
      }
    }

    if (isAdmin) {
      viewMode = "portal";
      targetAttribute = null;
    }

    // ===== user_course_access フィルタ =====
    let coursesAfterUserAccess = courses;
    if (!isAdmin && session?.user?.id) {
      const userAccess = (userAccessResult as any)?.data as { course_id: string }[] | null;
      const userCourseAccessIds = new Set((userAccess || []).map((a) => a.course_id));

      if (userCourseAccessIds.size === 0) {
        return (
          <CoursesClient
            courses={[]}
            viewMode={viewMode}
            targetAttribute={targetAttribute}
            modules={{}}
            lessons={{}}
            progress={{}}
            noAccessMessage="コースが割り当てられていません。管理者にお問い合わせください。"
          />
        );
      }
      coursesAfterUserAccess = coursesAfterUserAccess.filter((c: any) => userCourseAccessIds.has(c.id));
    }

    // ===== course_plan_access フィルタ =====
    let lockedCourses: any[] = [];
    let visibleCourses = coursesAfterUserAccess;

    if (!isAdmin && planId) {
      const allAccess = (allPlanAccessResult as any)?.data as { course_id: string; plan_id: string }[] | null;

      const myAccessIds = new Set(
        (allAccess || []).filter((a) => a.plan_id === planId).map((a) => a.course_id)
      );
      const otherPlanCourseIds = new Set(
        (allAccess || []).filter((a) => a.plan_id !== planId).map((a) => a.course_id)
      );

      // ロックされたコース: 他プランにのみあるコース
      const lockedIds = new Set<string>();
      for (const id of otherPlanCourseIds) {
        if (!myAccessIds.has(id)) lockedIds.add(id);
      }
      lockedCourses = coursesAfterUserAccess.filter((c: any) => lockedIds.has(c.id));

      // アクセス可能: 共通コース（plan_accessにエントリなし）+ 自プランのコース
      const allPlanCourseIds = new Set(
        (allAccess || []).map((a) => a.course_id)
      );
      const accessibleCourseIds = new Set<string>();
      for (const course of coursesAfterUserAccess) {
        if (!allPlanCourseIds.has(course.id) || myAccessIds.has(course.id)) {
          accessibleCourseIds.add(course.id);
        }
      }
      visibleCourses = visibleCourses.filter((c: any) => accessibleCourseIds.has(c.id));
    }

    // ===== 受講生が1コースのみ → コース詳細に直接リダイレクト =====
    if (!isAdmin && visibleCourses.length === 1) {
      const singleCourse = visibleCourses[0];
      redirect(`/courses/${singleCourse.slug || singleCourse.id}`);
    }

    // ===== カリキュラムビューの場合: modules + lessons + progress も取得 =====
    let modulesMap: Record<string, any[]> = {};
    let lessonsMap: Record<string, any[]> = {};
    let progressMap: Record<string, any> = {};

    if (viewMode === "curriculum" && courses.length > 0) {
      try {
        const courseIds = courses.map((c: any) => c.id);

        const [modulesRes, lessonsRes, progressRes] = await Promise.all([
          supabase
            .from("modules")
            .select("id, title, course_id, sort_order")
            .in("course_id", courseIds)
            .order("sort_order", { ascending: true }),
          supabase
            .from("lessons")
            .select("id, title, lesson_type, module_id, sort_order, duration_minutes")
            .in("course_id", courseIds)
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          session?.customerId
            ? supabase
                .from("lesson_progress")
                .select("lesson_id, status")
                .eq("customer_id", session.customerId)
            : Promise.resolve({ data: [] }),
        ]);

        for (const mod of ((modulesRes.data || []) as any[])) {
          if (!modulesMap[mod.course_id]) modulesMap[mod.course_id] = [];
          modulesMap[mod.course_id].push(mod);
        }

        for (const lesson of ((lessonsRes.data || []) as any[])) {
          if (!lessonsMap[lesson.module_id]) lessonsMap[lesson.module_id] = [];
          lessonsMap[lesson.module_id].push(lesson);
        }

        for (const p of ((progressRes.data || []) as any[])) {
          progressMap[p.lesson_id] = p;
        }
      } catch (e) {
        console.error("Failed to fetch curriculum data:", e);
        viewMode = "portal";
      }
    }

    return (
      <CoursesClient
        courses={visibleCourses}
        lockedCourses={lockedCourses}
        viewMode={viewMode}
        targetAttribute={targetAttribute}
        planName={planName}
        planId={planId}
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
