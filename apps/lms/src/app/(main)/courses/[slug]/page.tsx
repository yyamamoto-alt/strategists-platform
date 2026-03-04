import { createLmsServerClient } from "@/lib/supabase/server";
import { mockCourses, mockModules } from "@/lib/mock-data";
import { CourseDetailClient } from "./course-detail-client";

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
    return <CourseDetailClient course={course || null} modules={mods} slug={slug} />;
  }

  const supabase = await createLmsServerClient();

  // まずslugで検索、なければidで検索
  let { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .maybeSingle() as { data: any };

  if (!course) {
    const { data: byId } = await supabase
      .from("courses")
      .select("*")
      .eq("id", slug)
      .maybeSingle() as { data: any };
    course = byId;
  }

  if (!course) {
    return <CourseDetailClient course={null} modules={[]} slug={slug} />;
  }

  // modules + lessons 取得
  const { data: modules } = await supabase
    .from("modules")
    .select("*")
    .eq("course_id", course.id)
    .order("sort_order", { ascending: true }) as { data: any[] | null };

  const { data: lessons } = await supabase
    .from("lessons")
    .select("*")
    .eq("course_id", course.id)
    .order("sort_order", { ascending: true }) as { data: any[] | null };

  // modules に lessons を紐付け
  const modulesWithLessons = (modules || []).map((mod: any) => ({
    ...mod,
    lessons: (lessons || []).filter((l: any) => l.module_id === mod.id),
  }));

  return <CourseDetailClient course={course} modules={modulesWithLessons} slug={slug} />;
}
