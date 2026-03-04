import { createLmsServerClient } from "@/lib/supabase/server";
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
    return <LessonPlayerClient slug={slug} lessonId={lessonId} allLessons={allLessons} />;
  }

  const supabase = await createLmsServerClient();

  // slug → course_id 取得
  let { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle() as { data: any };

  if (!course) {
    const { data: byId } = await supabase
      .from("courses")
      .select("id")
      .eq("id", slug)
      .maybeSingle() as { data: any };
    course = byId;
  }

  if (!course) {
    return <LessonPlayerClient slug={slug} lessonId={lessonId} allLessons={[]} />;
  }

  // modules順 → lessons順で全レッスン取得
  const { data: modules } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", course.id)
    .order("sort_order", { ascending: true }) as { data: any[] | null };

  const { data: lessons } = await supabase
    .from("lessons")
    .select("*")
    .eq("course_id", course.id)
    .order("sort_order", { ascending: true }) as { data: any[] | null };

  // module順にレッスンを並べる
  const moduleOrder = (modules || []).map((m: any) => m.id);
  const sortedLessons = (lessons || []).sort((a: any, b: any) => {
    const aModIdx = moduleOrder.indexOf(a.module_id);
    const bModIdx = moduleOrder.indexOf(b.module_id);
    if (aModIdx !== bModIdx) return aModIdx - bModIdx;
    return a.sort_order - b.sort_order;
  });

  return <LessonPlayerClient slug={slug} lessonId={lessonId} allLessons={sortedLessons as Lesson[]} />;
}
