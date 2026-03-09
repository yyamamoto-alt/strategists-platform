import { NextRequest, NextResponse } from "next/server";
import { getLmsSession } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/settings — 設定一覧取得（管理者専用）
export async function GET() {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("key, value, description")
    .in("key", [
      "auto_invite_enabled",
      "auto_invite_slack_channel",
      "invite_email_template",
      "mentor_dm_template",
    ]);

  if (error) {
    console.error("settings GET error:", error);
    return NextResponse.json({ error: "設定の取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// PATCH /api/admin/settings — 設定更新
export async function PATCH(request: NextRequest) {
  const session = await getLmsSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { updates: { key: string; value: unknown }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const { updates } = body;
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "updates配列が必要です" }, { status: 400 });
  }

  const allowedKeys = [
    "auto_invite_enabled",
    "auto_invite_slack_channel",
    "invite_email_template",
    "mentor_dm_template",
  ];
  const supabase = createAdminClient();
  const db = supabase as any;

  const results = [];
  const errors = [];

  for (const update of updates) {
    if (!update.key || !allowedKeys.includes(update.key)) {
      errors.push({ key: update.key, error: "無効なキーです" });
      continue;
    }

    // upsert: 存在しなければ insert、存在すれば update
    const { data, error } = await db
      .from("app_settings")
      .upsert(
        {
          key: update.key,
          value: update.value,
          updated_at: new Date().toISOString(),
          updated_by: session.user.id,
        },
        { onConflict: "key" }
      )
      .select()
      .single();

    if (error) {
      errors.push({ key: update.key, error: error.message });
    } else {
      results.push(data);
    }
  }

  if (errors.length > 0 && results.length === 0) {
    return NextResponse.json(
      { error: "全ての更新が失敗しました", details: errors },
      { status: 500 }
    );
  }

  return NextResponse.json({
    updated: results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
