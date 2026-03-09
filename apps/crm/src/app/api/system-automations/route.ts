import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/system-automations
 * システム自動化のON/OFF状態を取得（app_settingsから）
 */
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .like("key", "sys_automation_%");

  const states: Record<string, boolean> = {};
  if (data) {
    for (const row of data) {
      // key: sys_automation_<id> → value: "true" or "false"
      const id = row.key.replace("sys_automation_", "");
      const val = row.value;
      states[id] = val === true || val === "true" || val === '"true"';
    }
  }

  return NextResponse.json(states);
}

/**
 * PATCH /api/system-automations
 * システム自動化のON/OFFを切り替え
 * Body: { id: string, enabled: boolean }
 */
export async function PATCH(request: Request) {
  let body: { id: string; enabled: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = `sys_automation_${body.id}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  // upsert
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key,
        value: body.enabled ? "true" : "false",
        description: `システム自動化 ${body.id} のON/OFF`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: body.id, enabled: body.enabled });
}
