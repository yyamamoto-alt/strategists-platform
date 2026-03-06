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
    return <CourseDetailClient course={course || null} modules={mods} slug={slug} progressMap={{}} />;
  }

  try {
    const supabase = createAdminClient();
    const session = await getLmsSession();

    // slugをデコード（URL encoding対策）
    const decodedSlug = decodeURIComponent(slug);

    // まずslugで検索、なければidで検索
    let { data: course } = await supabase
      .from("courses")
      .select("*")
      .eq("slug", decodedSlug)
      .maybeSingle() as { data: any };

    if (!course) {
      const { data: byId } = await supabase
        .from("courses")
        .select("*")
        .eq("id", decodedSlug)
        .maybeSingle() as { data: any };
      course = byId;
    }

    if (!course) {
      console.error(`Course not found: slug="${decodedSlug}"`);
      return <CourseDetailClient course={null} modules={[]} slug={slug} progressMap={{}} />;
    }

    // modules + lessons + progress を並列取得
    const [modulesRes, lessonsRes, progressRes] = await Promise.all([
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

    return <CourseDetailClient course={course} modules={modulesWithLessons} slug={slug} progressMap={progressMap} />;
  } catch (e) {
    // redirect() throws a special error, re-throw it
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("CourseDetailPage error:", e);
    return <CourseDetailClient course={null} modules={[]} slug={slug} progressMap={{}} />;
  }
}
