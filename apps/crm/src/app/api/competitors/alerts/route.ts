import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/competitors/alerts — アラート一覧 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("site_id");
  const unreadOnly = searchParams.get("unread_only") === "true";
  const limit = parseInt(searchParams.get("limit") || "50");

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  let query = db
    .from("competitor_alerts")
    .select("*, competitor_sites(name, url)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (siteId) {
    query = query.eq("site_id", siteId);
  }
  if (unreadOnly) {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ alerts: data || [] });
}

/** PATCH /api/competitors/alerts — アラートを既読にする */
export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, mark_all_read } = body;

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  if (mark_all_read) {
    const { error } = await db
      .from("competitor_alerts")
      .update({ is_read: true })
      .eq("is_read", false);

    if (error) {
      return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!id) {
    return NextResponse.json({ error: "id or mark_all_read is required" }, { status: 400 });
  }

  const { error } = await db
    .from("competitor_alerts")
    .update({ is_read: true })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
