import "server-only";

import { google } from "googleapis";

function getAuth(readonly = true) {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable");
  }

  const credentials = JSON.parse(credentialsJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: readonly
      ? ["https://www.googleapis.com/auth/spreadsheets.readonly"]
      : [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive",
        ],
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

/**
 * ヘッダー + 直近N行を取得してカラムごとのデータ有無を返す
 */
export async function fetchColumnDataStatus(
  spreadsheetId: string,
  sheetName: string,
  recentRows = 10
): Promise<{ headers: string[]; activeColumns: string[] }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // まず全行数を把握するためヘッダー + 末尾のデータを取得
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!1:1`,
  });
  const headers = headerRes.data.values?.[0] || [];
  if (headers.length === 0) return { headers: [], activeColumns: [] };

  // 最終列文字を計算
  const lastCol = String.fromCharCode(64 + Math.min(headers.length, 26));

  // 全データの行数を取得（A列で判定）
  const countRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:A`,
    majorDimension: "COLUMNS",
  });
  const totalRows = (countRes.data.values?.[0] || []).length; // ヘッダー含む

  if (totalRows <= 1) return { headers, activeColumns: [] };

  // 直近N行を取得
  const startRow = Math.max(2, totalRows - recentRows + 1);
  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A${startRow}:${lastCol}${totalRows}`,
  });
  const rows = dataRes.data.values || [];

  // 各カラムにデータが1つでもあるか判定
  const activeColumns: string[] = [];
  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const hasData = rows.some((row) => {
      const val = row[colIdx];
      return val !== undefined && val !== null && String(val).trim() !== "";
    });
    if (hasData) activeColumns.push(headers[colIdx]);
  }

  return { headers, activeColumns };
}

// ================================================================
// プログレスシート自動作成（Zapier移管）
// ================================================================

const PROGRESS_SHEET_TEMPLATE_ID = "1Xs0dNiMdN6teIMnlmNsMuBEXitrbFiPkD5h3I_Dlr6A";

/**
 * ProgressSheetテンプレートをコピーし、カルテ情報を書き込む
 * Zapier「カルテ記入→Progress Sheet作成」の移植
 */
export async function createProgressSheet(data: {
  name: string;
  email: string;
  nameKana?: string;
  attribute?: string;
  birthDate?: string;
  careerHistory?: string;
  caseStatus?: string;
  targetCompanies?: string;
  transferIntent?: string;
  university?: string;
  prefecture?: string;
  gender?: string;
  utmSource?: string;
  enrollmentReason?: string;
  interviewTiming?: string;
  desiredStartDate?: string;
  currentAgent?: string;
  planName?: string;
  agentUsage?: string;
}): Promise<{ url: string; spreadsheetId: string } | null> {
  try {
    const auth = getAuth(false); // read-write scope

    // 1. テンプレートをコピー
    const drive = google.drive({ version: "v3", auth });
    const title = `ProgressSheet_${data.name}_${data.email}`;

    const copyRes = await drive.files.copy({
      fileId: PROGRESS_SHEET_TEMPLATE_ID,
      requestBody: { name: title },
    });

    const newId = copyRes.data.id;
    if (!newId) return null;

    // 2. 「カルテ入力情報参照用」シートにカルテ情報を書き込み（行2）
    const sheets = google.sheets({ version: "v4", auth });

    const age = data.birthDate ? calculateAge(data.birthDate) : null;
    const ageStr = age !== null ? `${age}歳` : "";

    // Zapierのマッピングに基づいてカラムに書き込み
    const values = [
      data.name || "",                                           // A: お名前
      data.nameKana || "",                                       // B: フリガナ
      data.email || "",                                          // C: メールアドレス
      `${data.attribute || ""}${data.birthDate ? `/誕生日：${data.birthDate}` : ""}`, // D: 属性/誕生日
      data.careerHistory || "",                                  // E: 経歴詳細
      data.caseStatus || "",                                     // F: ケース面接対策の状況
      data.university || "",                                     // G: 大学
      data.prefecture || "",                                     // H: 居住地
      data.gender || "",                                         // I: 性別
      `知ったきっかけ：${data.utmSource || ""}\n決めて：${data.enrollmentReason || ""}`, // J
      "",                                                        // K
      `${data.targetCompanies || ""}、${data.transferIntent || ""}`, // L: 志望企業,転職意向
      data.interviewTiming || "",                                // M: 面接予定時期
      "",                                                        // N
      "",                                                        // O
      `入社希望日： ${data.desiredStartDate || ""}`,              // P
      "",                                                        // Q
      `${data.planName || ""}/エージェント割：${data.agentUsage || ""}`, // R
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: newId,
      range: "'カルテ入力情報参照用'!A2:R2",
      valueInputOption: "RAW",
      requestBody: { values: [values] },
    });

    // 3. サービスアカウントにはアクセス権があるので、リンク共有を設定
    await drive.permissions.create({
      fileId: newId,
      requestBody: {
        role: "writer",
        type: "anyone",
      },
    });

    const url = `https://docs.google.com/spreadsheets/d/${newId}/edit`;
    return { url, spreadsheetId: newId };
  } catch (e) {
    console.error("[createProgressSheet] Failed:", e);
    return null;
  }
}

/** 生年月日から年齢を計算 */
export function calculateAge(birthDateStr: string): number | null {
  try {
    // "2000/01/15", "2000-01-15", "2000年1月15日" 等に対応
    const normalized = birthDateStr
      .replace(/年|月/g, "/")
      .replace(/日/g, "")
      .trim();
    const birth = new Date(normalized);
    if (isNaN(birth.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
}
