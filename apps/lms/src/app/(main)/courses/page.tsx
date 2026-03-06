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
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    // コース一覧 + 受講生情報を並列取得
    const lmsClient = await createLmsServerClient();
    const coursesPromise = lmsClient
      .from("courses")
      .select("id, title, slug, description, category, level, duration_weeks, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    let targetAttribute: string | null = null;
    let viewMode: "curriculum" | "portal" = "portal";
    let planName: string | null = null;
    let planId: string | null = null;

    // 受講生情報を並列取得
    const customerPromise = session?.customerId
      ? supabase.from("customers").select("attribute").eq("id", session.customerId).single()
      : null;
    const contractPromise = session?.customerId
      ? supabase.from("contracts").select("plan_name").eq("customer_id", session.customerId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : null;
    const plansPromise = session?.customerId
      ? supabase.from("plans").select("id, slug, name").eq("is_active", true)
      : null;

    const [coursesResult, customerResult, contractResult, plansResult] = await Promise.all([
      coursesPromise,
      customerPromise,
      contractPromise,
      plansPromise,
    ]);

    const courses = coursesResult.data;

    if (session?.customerId) {
      try {
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
      } catch (e) {
        console.error("Failed to fetch customer/plan:", e);
      }
    }

    // admin/mentor はデフォルトでポータルビュー（全コース閲覧可）
    const isAdmin = session?.role === "admin" || session?.role === "mentor";
    if (isAdmin) {
      viewMode = "portal";
      targetAttribute = null;
    }

    // user_course_access によるコースレベルのアクセス制御
    // admin/mentor 以外は user_course_access に登録されたコースのみ表示
    let userCourseAccessIds: Set<string> | null = null; // null = チェック不要（admin/mentor）
    if (!isAdmin && session?.user?.id) {
      const { data: userAccess } = await supabase
        .from("user_course_access")
        .select("course_id")
        .eq("user_id", session.user.id) as { data: { course_id: string }[] | null };

      // user_course_access にエントリがない場合 → コースなし（空セット）
      // エントリがある場合 → そのコースのみ
      userCourseAccessIds = new Set((userAccess || []).map((a) => a.course_id));
    }

    // user_course_access でフィルタ（admin/mentor はスキップ）
    let coursesAfterUserAccess = (courses as any[]) || [];
    if (userCourseAccessIds !== null) {
      if (userCourseAccessIds.size === 0) {
        // アクセス権なし → 空状態を返す
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
      coursesAfterUserAccess = coursesAfterUserAccess.filter((c: any) => userCourseAccessIds!.has(c.id));
    }

    // course_plan_access でプラン別アクセス権を取得
    let accessibleCourseIds: Set<string> | null = null; // null = 全アクセス
    let lockedCourses: any[] = [];

    if (!isAdmin && planId) {
      // 自分のプランでアクセスできるコースID
      const { data: myAccess } = await supabase
        .from("course_plan_access")
        .select("course_id")
        .eq("plan_id", planId) as { data: { course_id: string }[] | null };

      const myAccessIds = new Set((myAccess || []).map((a: any) => a.course_id));

      // 他のプランでのみアクセスできるコースを特定
      const { data: allAccess } = await supabase
        .from("course_plan_access")
        .select("course_id, plan_id, plans ( name, tier, sort_order )")
        .neq("plan_id", planId) as { data: any[] | null };

      const lockedIds = new Set<string>();
      for (const access of allAccess || []) {
        if (!myAccessIds.has(access.course_id)) {
          lockedIds.add(access.course_id);
        }
      }

      // ロックされたコースを特定
      if (lockedIds.size > 0) {
        lockedCourses = coursesAfterUserAccess.filter((c: any) => lockedIds.has(c.id));
      }

      // course_plan_access にエントリがあるコースのみフィルタ対象
      // エントリがないコースは共通コース（全プランアクセス可）
      const allPlanCourseIds = new Set(
        (allAccess || []).map((a: any) => a.course_id).concat(
          (myAccess || []).map((a: any) => a.course_id)
        )
      );

      // アクセス可能: 共通コース + 自プランのコース
      accessibleCourseIds = new Set<string>();
      for (const course of coursesAfterUserAccess) {
        if (!allPlanCourseIds.has(course.id) || myAccessIds.has(course.id)) {
          accessibleCourseIds.add(course.id);
        }
      }
    }

    // アクセス権でフィルタリング
    let visibleCourses = coursesAfterUserAccess;
    if (accessibleCourseIds) {
      visibleCourses = visibleCourses.filter((c: any) => accessibleCourseIds!.has(c.id));
    }

    // カリキュラムビューの場合: modules + lessons + progress も取得
    let modulesMap: Record<string, any[]> = {};
    let lessonsMap: Record<string, any[]> = {};
    let progressMap: Record<string, any> = {};

    if (viewMode === "curriculum" && courses && (courses as any[]).length > 0) {
      try {
        const courseIds = (courses as any[]).map((c: any) => c.id);

        // modules, lessons, progress を並列取得
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
