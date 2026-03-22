import { createServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { getSpreadsheetInfo } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

function extractSpreadsheetId(input: string): string {
  // URL形式: https://docs.google.com/spreadsheets/d/{id}/...
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("automations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await request.json();
  const {
    name,
    spreadsheet_id: rawId,
    sheet_name,
    slack_channel_id,
    slack_channel_name,
    message_template,
    link_to_customer,
    column_mapping,
  } = body;

  if (!name || !rawId || !slack_channel_id) {
    return NextResponse.json(
      { error: "name, spreadsheet_id, slack_channel_id は必須です" },
      { status: 400 }
    );
  }

  const spreadsheet_id = extractSpreadsheetId(rawId);

  // スプレッドシート情報を取得してヘッダーを保存
  let known_headers: string[] = [];
  try {
    const info = await getSpreadsheetInfo(spreadsheet_id, sheet_name);
    known_headers = info.headers;
  } catch (e) {
    console.error("Failed to fetch spreadsheet info:", e);
    return NextResponse.json(
      { error: "スプレッドシートにアクセスできません。共有設定を確認してください。" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("automations")
    .insert({
      name,
      spreadsheet_id,
      sheet_name: sheet_name || "Sheet1",
      slack_channel_id,
      slack_channel_name: slack_channel_name || null,
      message_template: message_template || null,
      link_to_customer: link_to_customer || false,
      column_mapping: column_mapping || {},
      known_headers,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "操作に失敗しました" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
