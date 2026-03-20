import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/system-automations
 * システム自動化のON/OFF状態 + 設定オーバーライドを取得
 */
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .like("key", "sys_automation_%");

  const states: Record<string, boolean> = {};
  const configs: Record<string, Record<string, string | number>> = {};

  if (data) {
    for (const row of data) {
      const fullKey = row.key as string;

      // ON/OFF state: sys_automation_<id> (no more dots)
      if (!fullKey.includes(".")) {
        const id = fullKey.replace("sys_automation_", "");
        const val = row.value;
        states[id] = val === true || val === "true" || val === '"true"';
      }
      // Config override: sys_automation_<id>.config.<paramKey>
      else if (fullKey.includes(".config.")) {
        const parts = fullKey.replace("sys_automation_", "").split(".config.");
        const automationId = parts[0];
        const paramKey = parts[1];
        if (!configs[automationId]) configs[automationId] = {};
        // Try to parse as number
        const numVal = Number(row.value);
        configs[automationId][paramKey] = !isNaN(numVal) && row.value !== "" ? numVal : row.value;
      }
    }
  }

  return NextResponse.json({ states, configs });
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
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ id: body.id, enabled: body.enabled });
}

/**
 * POST /api/system-automations
 * 設定オーバーライドの保存
 * Body: { automationId: string, overrides: Record<string, string | number> }
 */
export async function POST(request: Request) {
  let body: { automationId: string; overrides: Record<string, string | number> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const upserts = Object.entries(body.overrides).map(([paramKey, value]) => ({
    key: `sys_automation_${body.automationId}.config.${paramKey}`,
    value: String(value),
    description: `${body.automationId} の設定: ${paramKey}`,
    updated_at: new Date().toISOString(),
  }));

  if (upserts.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert(upserts, { onConflict: "key" });

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, automationId: body.automationId });
}
