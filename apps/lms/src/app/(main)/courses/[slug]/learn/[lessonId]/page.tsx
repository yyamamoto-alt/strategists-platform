import { createAdminClient } from "@/lib/supabase/admin";
import { getLmsSession } from "@/lib/supabase/server";
import { mockModules } from "@/lib/mock-data";
import { LessonPlayerClient } from "./lesson-player-client";
import type { Lesson } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function LessonPlayerPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    const allLessons = mockModules.flatMap((m) => m.lessons || []);
    return <LessonPlayerClient slug={slug} lessonId={lessonId} allLessons={allLessons} progressMap={{}} customerId={null} />;
  }

  try {
    const supabase = createAdminClient();
    const decodedSlug = decodeURIComponent(slug);

    // session と course を並列取得
    const [session, courseQueryResult] = await Promise.all([
      getLmsSession(),
      supabase
        .from("courses")
        .select("id")
        .or(`slug.eq.${decodedSlug},id.eq.${decodedSlug}`)
        .limit(1) as unknown as Promise<{ data: any[] | null }>,
    ]);
    const course = courseQueryResult.data?.[0] || null;

    if (!course) {
      return <LessonPlayerClient slug={slug} lessonId={lessonId} allLessons={[]} progressMap={{}} customerId={null} />;
    }

    // modules, lessons, progress を並列取得
    const [modulesRes, lessonsRes, progressRes] = await Promise.all([
      supabase
        .from("modules")
        .select("id")
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

    // module順にレッスンを並べる
    const moduleOrder = (modules || []).map((m: any) => m.id);
    const sortedLessons = (lessons || []).sort((a: any, b: any) => {
      const aModIdx = moduleOrder.indexOf(a.module_id);
      const bModIdx = moduleOrder.indexOf(b.module_id);
      if (aModIdx !== bModIdx) return aModIdx - bModIdx;
      return a.sort_order - b.sort_order;
    });

    // 進捗マップ: lesson_id → status
    const progressMap: Record<string, string> = {};
    for (const p of progress) {
      progressMap[p.lesson_id] = p.status;
    }

    return (
      <LessonPlayerClient
        slug={slug}
        lessonId={lessonId}
        allLessons={sortedLessons as Lesson[]}
        progressMap={progressMap}
        customerId={session?.customerId || null}
      />
    );
  } catch (e) {
    console.error("LessonPlayerPage error:", e);
    return <LessonPlayerClient slug={slug} lessonId={lessonId} allLessons={[]} progressMap={{}} customerId={null} />;
  }
}
