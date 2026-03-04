import { createLmsServerClient } from "@/lib/supabase/server";
import { CoursesClient } from "./courses-client";
import { mockCourses } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <CoursesClient courses={mockCourses} />;
  }

  const supabase = await createLmsServerClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return <CoursesClient courses={(courses as any[]) || []} />;
}
