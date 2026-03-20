import { getLmsSession, createLmsServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getLmsSession();
  if (!session?.customerId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createLmsServerClient();

  const { data } = await supabase
    .from("lesson_progress")
    .select(
      "lesson_id, status, updated_at, lessons!inner(id, title, module_id, modules!inner(course_id, courses!inner(slug, title)))"
    )
    .eq("customer_id", session.customerId)
    .order("updated_at", { ascending: false })
    .limit(10);

  const lessons = (data || []).map((p: any) => ({
    id: p.lessons.id,
    title: p.lessons.title,
    courseSlug: p.lessons.modules?.courses?.slug || "",
    courseTitle: p.lessons.modules?.courses?.title || "",
    status: p.status,
    updatedAt: p.updated_at,
  }));

  return NextResponse.json({ lessons });
}
