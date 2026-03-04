import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings
 * List all settings from app_settings table
 */
export async function GET() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("app_settings")
    .select("*")
    .order("key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * PATCH /api/settings
 * Update one or more settings
 * Body: { updates: { key: string, value: any }[] }
 */
export async function PATCH(request: Request) {
  let body: { updates: { key: string; value: unknown }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { updates } = body;
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json(
      { error: "updates array is required" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const results = [];
  const errors = [];

  for (const update of updates) {
    if (!update.key) {
      errors.push({ key: update.key, error: "key is required" });
      continue;
    }

    const { data, error } = await db
      .from("app_settings")
      .update({
        value: update.value,
        updated_at: new Date().toISOString(),
      })
      .eq("key", update.key)
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
      { error: "All updates failed", details: errors },
      { status: 500 }
    );
  }

  return NextResponse.json({
    updated: results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
