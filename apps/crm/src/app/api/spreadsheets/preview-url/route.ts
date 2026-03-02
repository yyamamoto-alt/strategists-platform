import { NextResponse } from "next/server";
import { getSpreadsheetInfo } from "@/lib/google-sheets";

/**
 * GET /api/spreadsheets/preview-url?url=...&sheet=...
 * DB保存不要。URLからSpreadsheet ID を抽出し、タイトル・シート一覧・ヘッダーを返す
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url") || "";
  const sheet = searchParams.get("sheet") || undefined;

  // URLまたはIDからSpreadsheet IDを抽出
  let spreadsheetId = rawUrl.trim();
  const match = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    spreadsheetId = match[1];
  }

  if (!spreadsheetId) {
    return NextResponse.json(
      { error: "URLまたはSpreadsheet IDを指定してください" },
      { status: 400 }
    );
  }

  try {
    const info = await getSpreadsheetInfo(spreadsheetId, sheet);
    return NextResponse.json({
      spreadsheet_id: spreadsheetId,
      title: info.title,
      sheets: info.sheets.map((s) => s.title),
      headers: info.headers,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Google Sheets API error";

    if (message.includes("not found") || message.includes("404")) {
      return NextResponse.json(
        { error: "スプレッドシートが見つかりません。URLを確認し、サービスアカウントに共有されているか確認してください。" },
        { status: 404 }
      );
    }
    if (message.includes("permission") || message.includes("403")) {
      return NextResponse.json(
        { error: "アクセス権がありません。スプレッドシートをサービスアカウントのメールアドレスに共有してください。" },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
