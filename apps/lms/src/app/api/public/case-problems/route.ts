import { createLmsServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createLmsServerClient();
  const { searchParams } = request.nextUrl;
  const company = searchParams.get("company");
  const tag = searchParams.get("tag");
  const q = searchParams.get("q");

  let query = supabase
    .from("case_problems")
    .select("id, company, no, tags, question, is_public")
    .eq("is_public", true)
    .order("company")
    .order("no");

  if (company) query = query.eq("company", company);
  if (tag) query = query.contains("tags", [tag]);
  if (q) query = query.or(`company.ilike.%${q}%,question.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ problems: data || [] });
}
