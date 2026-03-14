import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { mockCourses, mockModules } from "@/lib/mock-data";
import { CourseDetailClient } from "./course-detail-client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    const course = mockCourses.find((c) => c.slug === slug || c.id === slug);
    const mods = mockModules.filter((m) => m.course_id === course?.id);
    return <CourseDetailClient course={course || null} modules={mods} slug={slug} progressMap={{}} forms={[]} />;
  }

  try {
    const supabase = createAdminClient();
    const decodedSlug = decodeURIComponent(slug);

    // session と course(slug/id両方) を並列取得
    const [session, bySlugResult, byIdResult] = await Promise.all([
      getLmsSession(),
      supabase.from("courses").select("*").eq("slug", decodedSlug).maybeSingle(),
      supabase.from("courses").select("*").eq("id", decodedSlug).maybeSingle(),
    ]);
    const course = (bySlugResult.data || byIdResult.data) as any;

    if (!course) {
      console.error(`Course not found: slug="${decodedSlug}"`);
      return <CourseDetailClient course={null} modules={[]} slug={slug} progressMap={{}} forms={[]} />;
    }

    // modules + lessons + progress + forms を並列取得
    const [modulesRes, lessonsRes, progressRes, formsRes, formAccessRes, contractRes, plansRes] = await Promise.all([
      supabase
        .from("modules")
        .select("*")
        .eq("course_id", course.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("lessons")
        .select("*")
        .eq("course_id", course.id)
        .order("sort_order", { ascending: true }),
      session?.customerId
        ? supabase
            .from("lesson_progress")
            .select("lesson_id, status")
            .eq("customer_id", session.customerId)
        : Promise.resolve({ data: [] }),
      (supabase as any).from("forms").select("id, title, url, description, sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
      (supabase as any).from("form_plan_access").select("form_id, plan_id"),
      session?.customerId
        ? supabase.from("contracts").select("plan_name").eq("customer_id", session.customerId).order("created_at", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("plans").select("id, name").eq("is_active", true),
    ]);

    const modules = modulesRes.data as any[] | null;
    const lessons = lessonsRes.data as any[] | null;
    const progress = (progressRes.data || []) as { lesson_id: string; status: string }[];

    // modules に lessons を紐付け
    const modulesWithLessons = (modules || []).map((mod: any) => ({
      ...mod,
      lessons: (lessons || []).filter((l: any) => l.module_id === mod.id),
    }));

    // 進捗マップ
    const progressMap: Record<string, string> = {};
    for (const p of progress) {
      progressMap[p.lesson_id] = p.status;
    }

    // レッスンが1つだけの場合は直接レッスンページにリダイレクト
    const allLessons = lessons || [];
    if (allLessons.length === 1) {
      redirect(`/courses/${slug}/learn/${allLessons[0].id}`);
    }

    // フォームをプランでフィルタリング
    const isAdmin = session?.role === "admin" || session?.role === "mentor";
    const allForms = (formsRes.data || []) as { id: string; title: string; url: string; description: string | null; sort_order: number }[];
    const allFormAccess = (formAccessRes.data || []) as { form_id: string; plan_id: string }[];
    const contractData = (contractRes as any)?.data as { plan_name: string } | null;
    const allPlans = (plansRes.data || []) as { id: string; name: string }[];

    let planId: string | null = null;
    if (contractData?.plan_name) {
      const matched = allPlans.find((p) =>
        contractData.plan_name.includes(p.name) || p.name.includes(contractData.plan_name)
      );
      if (matched) planId = matched.id;
    }

    const formAccessMap: Record<string, string[]> = {};
    for (const a of allFormAccess) {
      if (!formAccessMap[a.form_id]) formAccessMap[a.form_id] = [];
      formAccessMap[a.form_id].push(a.plan_id);
    }

    const filteredForms = isAdmin
      ? allForms
      : allForms.filter((f) => {
          const pids = formAccessMap[f.id] || [];
          return pids.length === 0 || (planId && pids.includes(planId));
        });

    return <CourseDetailClient course={course} modules={modulesWithLessons} slug={slug} progressMap={progressMap} forms={filteredForms} />;
  } catch (e) {
    // redirect() throws a special error, re-throw it
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("CourseDetailPage error:", e);
    return <CourseDetailClient course={null} modules={[]} slug={slug} progressMap={{}} forms={[]} />;
  }
}
