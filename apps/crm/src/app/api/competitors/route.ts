import { createServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/competitors — 競合サイト一覧 + 未読アラート数 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: sites, error } = await db
    .from("competitor_sites")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  // 未読アラート数を取得
  const { count: unreadCount } = await db
    .from("competitor_alerts")
    .select("*", { count: "exact", head: true })
    .eq("is_read", false);

  return NextResponse.json({ sites: sites || [], unreadCount: unreadCount || 0 });
}

/** POST /api/competitors — 新規サイト登録 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { name, url, check_frequency } = body;

  if (!name || !url) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("competitor_sites")
    .insert({ name, url, check_frequency: check_frequency || "daily" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ site: data });
}

/** PATCH /api/competitors — サイト更新 */
export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // フィールドホワイトリスト（Mass Assignment防止）
  const ALLOWED_FIELDS = ["name", "url", "check_frequency", "is_active"];
  const safeUpdates: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in updates) safeUpdates[key] = updates[key];
  }

  const { data, error } = await db
    .from("competitor_sites")
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ site: data });
}

/** DELETE /api/competitors — サイト削除 */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { error } = await db
    .from("competitor_sites")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
