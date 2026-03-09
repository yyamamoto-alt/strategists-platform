import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/staff-mapping
 * Reads staff_slack_mapping from app_settings
 */
export async function GET() {
  const supabase = createServiceClient() as any;

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "staff_slack_mapping")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // フラットなオブジェクトとして返す（settings-clientがそのまま使えるように）
  return NextResponse.json(data?.value ?? {});
}

/**
 * PATCH /api/staff-mapping
 * Updates staff_slack_mapping in app_settings
 * Body: Record<string, string> (直接マッピングオブジェクト)
 */
export async function PATCH(request: Request) {
  let mapping: Record<string, string>;
  try {
    mapping = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return NextResponse.json(
      { error: "mapping object is required" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient() as any;

  const { error } = await supabase
    .from("app_settings")
    .update({
      value: mapping,
      updated_at: new Date().toISOString(),
    })
    .eq("key", "staff_slack_mapping");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(mapping);
}
