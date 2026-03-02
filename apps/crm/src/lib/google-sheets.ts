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
 * スプレッドシートのタイトル + シート一覧 + 指定シートのヘッダーを一括取得
 */
export async function getSpreadsheetInfo(
  spreadsheetId: string,
  sheetName?: string
): Promise<{
  title: string;
  sheets: { title: string; sheetId: number }[];
  headers: string[];
}> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // タイトル + シート一覧を取得
  const metaRes = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "properties.title,sheets.properties.title,sheets.properties.sheetId",
  });

  const title = metaRes.data.properties?.title || "";
  const sheetList =
    metaRes.data.sheets?.map((s) => ({
      title: s.properties?.title || "",
      sheetId: s.properties?.sheetId || 0,
    })) || [];

  // ヘッダー行を取得（シート名指定がなければ最初のシート）
  const targetSheet = sheetName || sheetList[0]?.title || "Sheet1";
  let headers: string[] = [];
  try {
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${targetSheet}'!1:1`,
    });
    headers = headerRes.data.values?.[0] || [];
  } catch {
    // ヘッダー取得失敗は無視（シートが空の場合など）
  }

  return { title, sheets: sheetList, headers };
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
