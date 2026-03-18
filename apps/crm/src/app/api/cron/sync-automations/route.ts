import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchSheetData } from "@/lib/google-sheets";
import { sendSlackMessage, sendSlackDM, isSystemAutomationEnabled, logNotification } from "@/lib/slack";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ================================================================
// 型定義
// ================================================================

interface ExtraTarget {
  /** "channel" or "dm" */
  type: "channel" | "dm";
  /** チャンネルIDまたはSlackユーザーID */
  id: string;
  /** メッセージテンプレート（{{フィールド名}} で置換） */
  template: string;
  /** Bot名（channelの場合のみ） */
  bot_username?: string;
  /** 条件: 指定フィールドの値がmatchに一致する場合のみ送信 */
  condition?: {
    field: string;
    match: "contains" | "starts_with" | "not_empty" | "equals";
    value?: string;
  };
}

// ================================================================
// テンプレート展開
// ================================================================

function renderTemplate(
  template: string,
  rowData: Record<string, string>
): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, key) => rowData[key.trim()] || "");
}

function buildSlackMessage(
  automationName: string,
  rowData: Record<string, string>,
  template: string | null
): string | null {
  if (template) {
    return renderTemplate(template, rowData);
  }
  // テンプレート未設定 → 全フィールド送信は危険なので送信しない
  console.error(
    `[sync-automations] ${automationName}: message_template が未設定のため送信をスキップしました。DBにテンプレートを設定してください。`
  );
  return null;
}

// ================================================================
// 条件評価
// ================================================================

function evaluateCondition(
  condition: ExtraTarget["condition"],
  rowData: Record<string, string>
): boolean {
  if (!condition) return true; // 条件なし = 常に送信

  const fieldValue = rowData[condition.field] || "";
  switch (condition.match) {
    case "contains":
      return fieldValue.includes(condition.value || "");
    case "starts_with":
      return fieldValue.startsWith(condition.value || "");
    case "not_empty":
      return fieldValue.trim() !== "";
    case "equals":
      return fieldValue === (condition.value || "");
    default:
      return true;
  }
}

// ================================================================
// Extra targets（複数チャンネル・DM・条件分岐）送信
// ================================================================

async function sendExtraTargets(
  extraTargets: ExtraTarget[],
  rowData: Record<string, string>
): Promise<number> {
  if (!extraTargets || extraTargets.length === 0) return 0;

  let sent = 0;
  for (const target of extraTargets) {
    // 条件チェック
    if (!evaluateCondition(target.condition, rowData)) continue;

    const message = renderTemplate(target.template, rowData);
    if (!message.trim()) continue;

    try {
      if (target.type === "dm") {
        await sendSlackDM(target.id, message);
        sent++;
      } else {
        const ok = await sendSlackMessage(target.id, message, {
          username: target.bot_username,
        });
        if (ok) sent++;
      }
      // レートリミット対策
      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch (err) {
      console.error(
        `[sync-automations] extra target send failed (${target.type}:${target.id}):`,
        err
      );
    }
  }
  return sent;
}

// ================================================================
// メイン処理
// ================================================================

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("sync-spreadsheets"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allAutomations, error: fetchError } = await db
    .from("automations")
    .select("id,name,spreadsheet_id,sheet_name,slack_channel_id,message_template,bot_username,extra_targets,is_active,last_synced_row,known_headers,created_at,updated_at")
    .eq("is_active", true)
    .limit(200);

  if (fetchError) {
    return NextResponse.json({
      success: false,
      message: "Failed to fetch automations",
      error: fetchError.message,
    });
  }

  const automations = allAutomations || [];

  if (automations.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No active automations",
      processed: 0,
      total: allAutomations?.length || 0,
    });
  }

  const results = [];

  for (const automation of automations) {
    try {
      // ★ 同時実行防止: 処理直前にDBからlast_synced_rowを再取得
      // （別リクエストが既に更新している場合、最新値を使う）
      const { data: freshAuto } = await db
        .from("automations")
        .select("last_synced_row")
        .eq("id", automation.id)
        .single();
      if (freshAuto) {
        automation.last_synced_row = freshAuto.last_synced_row;
      }

      // ★ 初回実行（last_synced_row = 0）の場合、既存データをスキップして
      //   現在の行数を記録するだけにする（過去データの一斉送信を防止）
      if (automation.last_synced_row === 0 || automation.last_synced_row === null) {
        const allRows = await fetchSheetData(
          automation.spreadsheet_id,
          automation.sheet_name
        );
        const currentRowCount = allRows.length > 0 ? allRows.length - 1 : 0;
        const headers = allRows.length > 0 ? allRows[0] : [];

        const { error: initUpdateError } = await db
          .from("automations")
          .update({
            last_synced_row: currentRowCount + 1,
            known_headers: headers,
            updated_at: new Date().toISOString(),
          })
          .eq("id", automation.id);

        if (initUpdateError) {
          console.error(
            `[sync-automations] ${automation.name}: 初回last_synced_row更新失敗:`,
            initUpdateError
          );
        }

        const { error: initLogError } = await db.from("automation_logs").insert({
          automation_id: automation.id,
          status: "initialized",
          new_rows_count: 0,
          notifications_sent: 0,
          details: { skipped_existing: currentRowCount, reason: "first_run_skip" },
        });

        if (initLogError) {
          console.error(
            `[sync-automations] ${automation.name}: 初回ログ記録失敗:`,
            initLogError
          );
        }

        results.push({
          name: automation.name,
          new_rows: 0,
          initialized: true,
          skipped_existing: currentRowCount,
        });
        continue;
      }

      const startRow = automation.last_synced_row + 1;

      const allRows = await fetchSheetData(
        automation.spreadsheet_id,
        automation.sheet_name,
        startRow
      );

      if (allRows.length < 2) {
        await db.from("automation_logs").insert({
          automation_id: automation.id,
          status: "no_new_rows",
          new_rows_count: 0,
          notifications_sent: 0,
        });
        results.push({ name: automation.name, new_rows: 0 });
        continue;
      }

      const headers = allRows[0];
      const dataRows = allRows.slice(1);

      // ★ 安全上限: 1回の実行で送信する通知数を制限
      const MAX_NOTIFICATIONS_PER_RUN = 20;
      if (dataRows.length > MAX_NOTIFICATIONS_PER_RUN) {
        console.warn(
          `[sync-automations] ${automation.name}: ${dataRows.length} rows detected, exceeds limit of ${MAX_NOTIFICATIONS_PER_RUN}. Skipping.`
        );

        const totalRow = automation.last_synced_row + dataRows.length;
        await db
          .from("automations")
          .update({
            last_synced_row: totalRow,
            last_triggered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", automation.id);

        await db.from("automation_logs").insert({
          automation_id: automation.id,
          status: "skipped_too_many",
          new_rows_count: dataRows.length,
          notifications_sent: 0,
          details: {
            reason: `Exceeded max ${MAX_NOTIFICATIONS_PER_RUN} notifications per run`,
            actual_rows: dataRows.length,
          },
        });

        results.push({
          name: automation.name,
          new_rows: dataRows.length,
          skipped: true,
          reason: `exceeded_limit_${MAX_NOTIFICATIONS_PER_RUN}`,
        });
        continue;
      }

      // ヘッダー変更検知
      const prevHeaders: string[] = automation.known_headers || [];
      const headersChanged =
        headers.length !== prevHeaders.length ||
        headers.some((h: string, i: number) => h !== prevHeaders[i]);
      if (headersChanged) {
        await db
          .from("automations")
          .update({ known_headers: headers })
          .eq("id", automation.id);
      }

      let notificationsSent = 0;
      let notificationsFailed = 0;
      let newRowsCount = 0;
      let rowsSkippedDup = 0;
      const extraTargets: ExtraTarget[] = automation.extra_targets || [];
      const botUsername: string | undefined = automation.bot_username || undefined;
      const newSentHashes: string[] = [];

      for (const row of dataRows) {
        if (row.every((cell: string) => !cell || cell.trim() === "")) continue;

        // 行データのハッシュ生成（タイムスタンプ列を除外）
        const rowForHash: Record<string, string> = {};
        headers.forEach((h: string, i: number) => {
          if (i < row.length && row[i] && h !== "タイムスタンプ") rowForHash[h] = row[i];
        });
        const rowHash = crypto.createHash("md5").update(JSON.stringify(rowForHash)).digest("hex");

        // ★ DBレベルの重複チェック: automation_sent_hashesテーブルで確認
        // UNIQUE(automation_id, row_hash)制約により、同じハッシュは絶対に二重送信されない
        const { error: insertHashError } = await db
          .from("automation_sent_hashes")
          .insert({
            automation_id: automation.id,
            row_hash: rowHash,
          });

        if (insertHashError) {
          // UNIQUE制約違反 = 既に送信済み → スキップ
          if (insertHashError.code === "23505") {
            rowsSkippedDup++;
            continue;
          }
          // その他のエラーはログ出力して続行
          console.error(
            `[sync-automations] ${automation.name}: hash insert error:`,
            insertHashError
          );
        }

        newRowsCount++;
        newSentHashes.push(rowHash);

        // 行データをkey-valueに変換
        const rowData: Record<string, string> = {};
        headers.forEach((h: string, i: number) => {
          if (i < row.length && row[i]) rowData[h] = row[i];
        });

        // ① メイン通知送信
        const message = buildSlackMessage(
          automation.name,
          rowData,
          automation.message_template
        );
        if (message) {
          const sent = await sendSlackMessage(automation.slack_channel_id, message, {
            username: botUsername,
          });
          if (sent) {
            notificationsSent++;
          } else {
            notificationsFailed++;
          }
          // ★ notification_logsに記録（成功/失敗問わず）
          await logNotification({
            type: `sync_${automation.name}`,
            channel: automation.slack_channel_id,
            message: message.slice(0, 500),
            status: sent ? "success" : "failed",
            metadata: { automation_id: automation.id, row_hash: rowHash },
          }).catch(() => {});
        }

        // ② Extra targets（複数チャンネル・DM・条件分岐）
        const extraSent = await sendExtraTargets(extraTargets, rowData);
        notificationsSent += extraSent;

        // レートリミット対策
        if (notificationsSent > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      // ★ last_synced_row更新: 楽観ロック → 失敗時は強制更新
      // ハッシュテーブルがあるので、last_synced_rowが多少ずれても重複送信は防げる
      const totalRow = automation.last_synced_row + dataRows.length;

      const { data: updateResult, error: updateError } = await db
        .from("automations")
        .update({
          last_synced_row: totalRow,
          last_triggered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", automation.id)
        .eq("last_synced_row", automation.last_synced_row) // 楽観ロック
        .select("id");

      if (updateError) {
        console.error(
          `[sync-automations] ${automation.name}: last_synced_row更新失敗:`,
          updateError
        );
        // 楽観ロック失敗時は強制更新（ハッシュテーブルで重複は防がれる）
        await db
          .from("automations")
          .update({
            last_synced_row: totalRow,
            last_triggered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", automation.id);
      } else if (!updateResult || updateResult.length === 0) {
        console.warn(
          `[sync-automations] ${automation.name}: last_synced_row競合検出 → 強制更新 (target=${totalRow})`
        );
        // ★ 競合時も強制更新。ハッシュテーブルが重複を防ぐので安全
        await db
          .from("automations")
          .update({
            last_synced_row: totalRow,
            last_triggered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", automation.id);
      } else {
        console.log(
          `[sync-automations] ${automation.name}: last_synced_row ${automation.last_synced_row} → ${totalRow}`
        );
      }

      const { error: logError } = await db.from("automation_logs").insert({
        automation_id: automation.id,
        status: "success",
        new_rows_count: newRowsCount,
        notifications_sent: notificationsSent,
        details: { headers, sample_row: dataRows[0], sent_hashes: newSentHashes, skipped_duplicates: rowsSkippedDup },
      });

      if (logError) {
        console.error(
          `[sync-automations] ${automation.name}: ログ記録失敗:`,
          logError
        );
      }

      results.push({
        name: automation.name,
        new_rows: newRowsCount,
        notifications: notificationsSent,
        ...(notificationsFailed > 0 && { notifications_failed: notificationsFailed }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      console.error(`Automation sync error for ${automation.name}:`, err);

      await db.from("automation_logs").insert({
        automation_id: automation.id,
        status: "failed",
        error_message: message.substring(0, 500),
      });

      results.push({ name: automation.name, error: message });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}
