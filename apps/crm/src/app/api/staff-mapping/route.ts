import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getSettingKey(request: Request): string {
  const url = new URL(request.url);
  return url.searchParams.get("type") === "name" ? "staff_name_mapping" : "staff_slack_mapping";
}

/**
 * GET /api/staff-mapping
 * ?type=name → staff_name_mapping (ニックネーム→本名)
 * default → staff_slack_mapping (名前→Slack ID)
 */
export async function GET(request: Request) {
  const key = getSettingKey(request);
  const supabase = createServiceClient() as any;

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data?.value ?? {});
}

/**
 * PATCH /api/staff-mapping
 * ?type=name → staff_name_mapping
 * default → staff_slack_mapping
 * Body: Record<string, string>
 */
export async function PATCH(request: Request) {
  const key = getSettingKey(request);

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

  // upsertで対応（初回はINSERT、以降はUPDATE）
  const { error } = await supabase
    .from("app_settings")
    .upsert({
      key,
      value: mapping,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(mapping);
}
