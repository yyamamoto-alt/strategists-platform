import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchSheetData } from "@/lib/google-sheets";
import { extractFieldsFromRow, upsertFromSpreadsheet } from "@/lib/customer-matching";

export const maxDuration = 300; // 5分（Vercel Pro: 最大300秒）

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 1. 接続設定を取得
  const { data: connection, error: connError } = await db
    .from("spreadsheet_connections")
    .select("*")
    .eq("id", id)
    .single();

  if (connError || !connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  // 2. 同期ログを作成
  const { data: syncLog, error: logError } = await db
    .from("sync_logs")
    .insert({ connection_id: id })
    .select()
    .single();

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  try {
    // 3. Google Sheets からデータ取得
    const startRow = connection.sync_mode === "append" && connection.last_synced_row > 0
      ? connection.last_synced_row + 1
      : undefined;

    const allRows = await fetchSheetData(
      connection.spreadsheet_id,
      connection.sheet_name,
      startRow
    );

    if (allRows.length < 2) {
      // ヘッダーのみ or データなし
      await db
        .from("sync_logs")
        .update({
          finished_at: new Date().toISOString(),
          status: "success",
          rows_processed: 0,
        })
        .eq("id", syncLog.id);

      return NextResponse.json({
        success: true,
        rows_processed: 0,
        rows_created: 0,
        rows_updated: 0,
        rows_unmatched: 0,
      });
    }

    const headers = allRows[0];
    const dataRows = allRows.slice(1);
    const columnMapping = connection.column_mapping as Record<string, string>;

    let rowsCreated = 0;
    let rowsUpdated = 0;
    let rowsUnmatched = 0;

    // 4. 各行を処理
    for (const row of dataRows) {
      // 空行をスキップ
      if (row.every((cell: string) => !cell || cell.trim() === "")) continue;

      const fields = extractFieldsFromRow(row, headers, columnMapping);
      const rawData: Record<string, string> = {};
      headers.forEach((h: string, i: number) => {
        if (i < row.length && row[i]) rawData[h] = row[i];
      });

      const result = await upsertFromSpreadsheet(
        id,
        syncLog.id,
        fields,
        rawData,
        connection.name,
        connection.auto_create_customer === true
      );

      if (result.action === "created") rowsCreated++;
      else if (result.action === "updated") rowsUpdated++;
      else if (result.action === "unmatched") rowsUnmatched++;
    }

    // 5. 同期ログ・接続設定を更新
    const totalRow = startRow
      ? (connection.last_synced_row + dataRows.length)
      : (dataRows.length + 1); // +1 for header

    await Promise.all([
      db
        .from("sync_logs")
        .update({
          finished_at: new Date().toISOString(),
          status: "success",
          rows_processed: dataRows.length,
          rows_created: rowsCreated,
          rows_updated: rowsUpdated,
          rows_unmatched: rowsUnmatched,
        })
        .eq("id", syncLog.id),
      db
        .from("spreadsheet_connections")
        .update({
          last_synced_at: new Date().toISOString(),
          last_synced_row: totalRow,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id),
    ]);

    return NextResponse.json({
      success: true,
      rows_processed: dataRows.length,
      rows_created: rowsCreated,
      rows_updated: rowsUpdated,
      rows_unmatched: rowsUnmatched,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";

    await db
      .from("sync_logs")
      .update({
        finished_at: new Date().toISOString(),
        status: "error",
        error_message: message,
      })
      .eq("id", syncLog.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
