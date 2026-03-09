import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchSheetData } from "@/lib/google-sheets";
import { extractFieldsFromRow, upsertFromSpreadsheet } from "@/lib/customer-matching";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";
import crypto from "crypto";

/** JSONB key order-independent hash for dedup comparison */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return JSON.stringify(obj.map(stableStringify));
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return JSON.stringify(
    Object.fromEntries(sorted.map((k) => [k, (obj as Record<string, unknown>)[k]]))
  );
}

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

  // 全アクティブ接続を取得（2回に分けて取得 — Supabaseクライアントの暗黙的リミット対策）
  const [{ data: conn1 }, { data: conn2 }] = await Promise.all([
    db.from("spreadsheet_connections").select("*").eq("is_active", true).eq("source_type", "google_sheets").limit(50).order("name"),
    db.from("spreadsheet_connections").select("*").eq("is_active", true).neq("source_type", "google_sheets").limit(50).order("name"),
  ]);
  const connections = [...(conn1 || []), ...(conn2 || [])];

  if (connections.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No active connections found",
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

      // ============================================================
      // note販売など orders テーブルに直接同期するタイプ
      // ============================================================
      if (connection.source_type === "note_sales") {
        // ヘッダーから列インデックスを取得
        const colIdx = (name: string) => headers.indexOf(name);
        const iTimestamp = colIdx("タイムスタンプ");
        const iName = colIdx("名前");
        const iProduct = colIdx("商品名");
        const iType = colIdx("商品タイプ");
        const iPrice = colIdx("値段");
        const iOrderId = colIdx("注文ID");

        // 既存の source_record_id を取得（重複防止）
        const { data: existingOrders } = await db
          .from("orders")
          .select("source_record_id")
          .eq("source", "note")
          .not("source_record_id", "is", null);
        const existingIds = new Set(
          (existingOrders || []).map((o: { source_record_id: string }) => o.source_record_id)
        );

        for (const row of dataRows) {
          if (row.every((cell: string) => !cell || cell.trim() === "")) continue;

          try {
            const orderId = iOrderId >= 0 ? row[iOrderId] : null;
            if (!orderId) continue;

            // 既存チェック
            if (existingIds.has(orderId)) {
              rowsSkipped++;
              continue;
            }

            const amount = iPrice >= 0 && row[iPrice] ? parseInt(row[iPrice].replace(/[,¥]/g, ""), 10) || 0 : 0;
            const timestamp = iTimestamp >= 0 ? row[iTimestamp] : null;
            const paidAt = timestamp ? new Date(timestamp.replace(" +0900", "+09:00")).toISOString() : null;
            const productName = iProduct >= 0 ? row[iProduct] : null;
            const productType = iType >= 0 ? row[iType] : null;
            const contactName = iName >= 0 ? row[iName] : null;

            let orderType = "other";
            if (productType === "教科書") orderType = "note_textbook";
            else if (productType === "マガジン") orderType = "note_magazine";
            else if (productType === "動画講座") orderType = "note_video";

            const { data: upsertResult, error: insertError } = await db.from("orders").upsert({
              source: "note",
              source_record_id: orderId,
              amount,
              status: "paid",
              payment_method: "other",
              paid_at: paidAt,
              match_status: "not_applicable",
              order_type: orderType,
              product_name: productName,
              contact_name: contactName,
              raw_data: Object.fromEntries(headers.map((h: string, i: number) => [h, row[i] || ""])),
            }, { onConflict: "source,source_record_id", ignoreDuplicates: true }).select("id");

            if (insertError) {
              console.error(`note order insert error:`, insertError);
              rowsUnmatched++;
            } else if (upsertResult && upsertResult.length > 0) {
              rowsCreated++;
              existingIds.add(orderId);
            } else {
              rowsSkipped++;
            }
          } catch (rowErr) {
            console.error(`Row processing error in ${connection.name}:`, rowErr);
          }
        }
      } else {
        // ============================================================
        // 通常のフォーム同期（application_history + customer matching）
        // ============================================================

        // 同期済みraw_data_hashを取得（重複検知用 — DBユニーク制約との二重防御）
        const [{ data: recentHistory }, { data: recentUnmatched }] = await Promise.all([
          db.from("application_history").select("raw_data_hash").eq("source", connection.name).order("applied_at", { ascending: false }).limit(5000),
          db.from("unmatched_records").select("raw_data").eq("connection_id", connection.id).order("created_at", { ascending: false }).limit(2000),
        ]);
        const knownHashes = new Set<string>();
        for (const h of (recentHistory || [])) {
          const hash = (h as { raw_data_hash: string }).raw_data_hash;
          if (hash) knownHashes.add(hash);
        }
        for (const h of (recentUnmatched || [])) {
          knownHashes.add(stableStringify((h as { raw_data: Record<string, unknown> }).raw_data));
        }

        for (const row of dataRows) {
          if (row.every((cell: string) => !cell || cell.trim() === "")) continue;

          try {
            const fields = extractFieldsFromRow(row, headers, columnMapping);
            const rawData: Record<string, string> = {};
            headers.forEach((h: string, i: number) => {
              if (i < row.length && row[i]) rawData[h] = row[i];
            });

            // ダブルチェック: 同じraw_data_hashが既にあればスキップ（DBユニーク制約との二重防御）
            const rawHash = crypto.createHash("md5").update(stableStringify(rawData)).digest("hex");
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
      }

      const totalRow = startRow
        ? connection.last_synced_row + dataRows.length
        : dataRows.length + 1;

      // sync_log更新
      if (syncLog) {
        await db
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
          .eq("id", syncLog.id);
      }

      // connection更新（last_synced_row）— エラーチェック付き
      const { error: updateError } = await db
        .from("spreadsheet_connections")
        .update({
          last_synced_at: new Date().toISOString(),
          last_synced_row: totalRow,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      if (updateError) {
        console.error(`Failed to update last_synced_row for ${connection.name}:`, updateError);
      }

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

  // 帰属チャネル未計算の顧客を一括補完（最大50件/回）
  let attributionFilled = 0;
  try {
    const { data: allAttr } = await db
      .from("customer_channel_attribution")
      .select("customer_id");
    const attrSet = new Set((allAttr || []).map((r: { customer_id: string }) => r.customer_id));

    const { data: recentCustomers } = await db
      .from("customers")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(200);

    const missing = (recentCustomers || []).filter((c: { id: string }) => !attrSet.has(c.id));

    for (const row of missing.slice(0, 50)) {
      try {
        await computeAttributionForCustomer(row.id);
        attributionFilled++;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  return NextResponse.json({
    success: true,
    synced: results.length,
    results,
    attribution_filled: attributionFilled,
  });
}
