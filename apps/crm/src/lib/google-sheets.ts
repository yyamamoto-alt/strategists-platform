import "server-only";

import { google } from "googleapis";

function getAuth() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable");
  }

  const credentials = JSON.parse(credentialsJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

/**
 * スプレッドシートからデータを取得
 * @returns ヘッダー行を含む2次元配列
 */
export async function fetchSheetData(
  spreadsheetId: string,
  sheetName: string,
  startRow?: number
): Promise<string[][]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const range = startRow && startRow > 1
    ? `'${sheetName}'!A1:ZZ1,'${sheetName}'!A${startRow}:ZZ`
    : `'${sheetName}'`;

  if (startRow && startRow > 1) {
    // ヘッダー行 + startRow以降を取得
    const [headerRes, dataRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!1:1`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A${startRow}:ZZ`,
      }),
    ]);

    const headers = headerRes.data.values?.[0] || [];
    const rows = dataRes.data.values || [];
    return [headers, ...rows];
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'`,
  });

  return res.data.values || [];
}

/**
 * スプレッドシートのシート名一覧を取得
 */
export async function getSheetMetadata(
  spreadsheetId: string
): Promise<{ title: string; sheetId: number }[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId",
  });

  return (
    res.data.sheets?.map((s) => ({
      title: s.properties?.title || "",
      sheetId: s.properties?.sheetId || 0,
    })) || []
  );
}

/**
 * ヘッダー行のみを取得（プレビュー用）
 */
export async function fetchSheetHeaders(
  spreadsheetId: string,
  sheetName: string
): Promise<string[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!1:1`,
  });

  return res.data.values?.[0] || [];
}
