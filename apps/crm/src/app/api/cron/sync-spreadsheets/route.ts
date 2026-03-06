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
      // 同時実行チェック: 既にrunning中のsync_logがあればスキップ
      const { data: runningLogs } = await db
        .from("sync_logs")
        .select("id")
        .eq("connection_id", connection.id)
        .eq("status", "running")
        .limit(1);
      if (runningLogs && runningLogs.length > 0) {
        results.push({ connection: connection.name, skipped: "already running" });
        continue;
      }

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

      // ヘッダー変更検知: known_headers を更新
      const prevHeaders: string[] = connection.known_headers || [];
      const headersChanged =
        headers.length !== prevHeaders.length ||
        headers.some((h: string, i: number) => h !== prevHeaders[i]);
      if (headersChanged) {
        await db
          .from("spreadsheet_connections")
          .update({ known_headers: headers })
          .eq("id", connection.id);
      }

      let rowsCreated = 0;
      let rowsUpdated = 0;
      let rowsUnmatched = 0;
      let rowsSkipped = 0;
      const syncedRecords: { action: string; name: string | null; email: string | null; summary: Record<string, string> }[] = [];

      // 直近の同期済みraw_dataハッシュを取得（重複検知用ダブルチェック）
      const { data: recentHistory } = await db
        .from("application_history")
        .select("raw_data")
        .eq("source", connection.name)
        .order("applied_at", { ascending: false })
        .limit(500);
      const knownHashes = new Set<string>(
        (recentHistory || []).map((h: { raw_data: Record<string, unknown> }) =>
          JSON.stringify(h.raw_data)
        )
      );

      for (const row of dataRows) {
        if (row.every((cell: string) => !cell || cell.trim() === "")) continue;

        try {
          const fields = extractFieldsFromRow(row, headers, columnMapping);
          const rawData: Record<string, string> = {};
          headers.forEach((h: string, i: number) => {
            if (i < row.length && row[i]) rawData[h] = row[i];
          });

          // ダブルチェック: まったく同じraw_dataが既にあればスキップ
          const rawHash = JSON.stringify(rawData);
          if (knownHashes.has(rawHash)) {
            rowsSkipped++;
            continue;
          }
          knownHashes.add(rawHash);

          const result = await upsertFromSpreadsheet(
            connection.id,
            syncLog?.id,
            fields,
            rawData,
            connection.name,
            connection.auto_create_customer === true
          );

          if (result.action === "created") rowsCreated++;
          else if (result.action === "updated") rowsUpdated++;
          else if (result.action === "unmatched") rowsUnmatched++;

          if (syncedRecords.length < 100) {
            const summaryKeys = headers.slice(0, 5);
            const summary: Record<string, string> = {};
            for (const k of summaryKeys) {
              if (rawData[k]) summary[k] = String(rawData[k]).substring(0, 100);
            }
            syncedRecords.push({
              action: result.action,
              name: fields.name || null,
              email: fields.email || null,
              summary,
            });
          }
        } catch (rowErr) {
          console.error(`Row processing error in ${connection.name}:`, rowErr);
          // 1行のエラーで全体を止めない
        }
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
              details: { records: syncedRecords, rows_skipped: rowsSkipped },
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
        rows_skipped: rowsSkipped,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      console.error(`Sync error for ${connection.name}:`, err);

      // sync_logが作成済みなら failed に更新
      try {
        const { data: latestLog } = await db
          .from("sync_logs")
          .select("id")
          .eq("connection_id", connection.id)
          .eq("status", "running")
          .order("started_at", { ascending: false })
          .limit(1)
          .single();
        if (latestLog) {
          await db
            .from("sync_logs")
            .update({
              finished_at: new Date().toISOString(),
              status: "failed",
              error_message: message.substring(0, 500),
            })
            .eq("id", latestLog.id);
        }
      } catch {
        // sync_log更新失敗は無視
      }

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
