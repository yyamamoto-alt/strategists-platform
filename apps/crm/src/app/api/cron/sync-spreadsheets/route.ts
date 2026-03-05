import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchSheetData } from "@/lib/google-sheets";
import { extractFieldsFromRow, upsertFromSpreadsheet } from "@/lib/customer-matching";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  // Vercel Cron認証チェック
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 全アクティブ接続を取得（LP系もフォーム系もすべて同期）
  const { data: connections, error: connError } = await db
    .from("spreadsheet_connections")
    .select("*")
    .eq("is_active", true);

  if (connError || !connections || connections.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No active auto-create connections found",
      synced: 0,
    });
  }

  const results = [];

  for (const connection of connections) {
    try {
      // 同期ログを作成
      const { data: syncLog } = await db
        .from("sync_logs")
        .insert({ connection_id: connection.id })
        .select()
        .single();

      // Google Sheets からデータ取得（append: 前回の続きから）
      const startRow =
        connection.sync_mode === "append" && connection.last_synced_row > 0
          ? connection.last_synced_row + 1
          : undefined;

      const allRows = await fetchSheetData(
        connection.spreadsheet_id,
        connection.sheet_name,
        startRow
      );

      if (allRows.length < 2) {
        // 新しい行なし
        if (syncLog) {
          await db
            .from("sync_logs")
            .update({
              finished_at: new Date().toISOString(),
              status: "success",
              rows_processed: 0,
            })
            .eq("id", syncLog.id);
        }
        results.push({
          connection: connection.name,
          rows_processed: 0,
          rows_created: 0,
          rows_updated: 0,
          rows_unmatched: 0,
        });
        continue;
      }

      const headers = allRows[0];
      const dataRows = allRows.slice(1);
      const columnMapping = connection.column_mapping as Record<string, string>;

      let rowsCreated = 0;
      let rowsUpdated = 0;
      let rowsUnmatched = 0;

      for (const row of dataRows) {
        if (row.every((cell: string) => !cell || cell.trim() === "")) continue;

        const fields = extractFieldsFromRow(row, headers, columnMapping);
        const rawData: Record<string, string> = {};
        headers.forEach((h: string, i: number) => {
          if (i < row.length && row[i]) rawData[h] = row[i];
        });

        const result = await upsertFromSpreadsheet(
          connection.id,
          syncLog?.id,
          fields,
          rawData,
          connection.name,
          true
        );

        if (result.action === "created") rowsCreated++;
        else if (result.action === "updated") rowsUpdated++;
        else if (result.action === "unmatched") rowsUnmatched++;
      }

      const totalRow = startRow
        ? connection.last_synced_row + dataRows.length
        : dataRows.length + 1;

      await Promise.all([
        syncLog &&
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
          .eq("id", connection.id),
      ]);

      results.push({
        connection: connection.name,
        rows_processed: dataRows.length,
        rows_created: rowsCreated,
        rows_updated: rowsUpdated,
        rows_unmatched: rowsUnmatched,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      results.push({
        connection: connection.name,
        error: message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    synced: results.length,
    results,
  });
}
