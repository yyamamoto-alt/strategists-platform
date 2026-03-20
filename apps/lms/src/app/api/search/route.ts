import { getLmsSession, createLmsServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getLmsSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createLmsServerClient() as any;

  // Search lessons by title or content
  const { data: lessons } = await supabase
    .from("lessons")
    .select(
      "id, title, markdown_content, module_id, modules!inner(course_id, courses!inner(slug, title))"
    )
    .or(`title.ilike.%${q}%,markdown_content.ilike.%${q}%`)
    .limit(20);

  // Format results
  const results = (lessons || []).map((l: any) => ({
    id: l.id,
    title: l.title,
    courseSlug: (l as any).modules?.courses?.slug || "",
    courseTitle: (l as any).modules?.courses?.title || "",
    snippet: l.markdown_content
      ? l.markdown_content.substring(0, 100) + "..."
      : "",
  }));

  return NextResponse.json({ results });
}
