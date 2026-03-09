import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchSheetData } from "@/lib/google-sheets";
import { sendSlackMessage } from "@/lib/slack";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function checkAndSendEscalation(
  automationName: string,
  rowData: Record<string, string>,
  channel: string
) {
  if (!automationName.includes("評価")) return;

  // 評価値を探す
  const ratingKey = Object.keys(rowData).find((k) => k.includes("評価"));
  if (!ratingKey) return;
  const ratingValue = rowData[ratingKey];
  if (!ratingValue || (!/^1/.test(ratingValue) && !/^2/.test(ratingValue))) return;

  // 低評価検出 — エスカレーションメッセージ送信
  const mentorKey = Object.keys(rowData).find((k) => k.includes("メンター"));
  const nameKey = Object.keys(rowData).find((k) => k.includes("名前") || k.includes("氏名"));
  const feedbackKey = Object.keys(rowData).find((k) => k.includes("連絡") || k.includes("依頼"));

  const mentor = mentorKey ? rowData[mentorKey] : "不明";
  const studentName = nameKey ? rowData[nameKey] : "不明";
  const feedback = feedbackKey ? rowData[feedbackKey] : "なし";

  const escalationMessage = [
    "<@U07GRS0T681><@U03TF7YESK1>",
    "*低評価がついてます*",
    `*担当メンター：* ${mentor}`,
    `*名前：* ${studentName}`,
    `*評価：* ${ratingValue}`,
    `*運営への連絡・依頼事項：* ${feedback}`,
  ].join("\n");

  await sendSlackMessage(channel, escalationMessage);
}

function buildSlackMessage(
  automationName: string,
  rowData: Record<string, string>,
  template: string | null
): string {
  if (template) {
    return template.replace(/\{\{(.+?)\}\}/g, (_, key) => rowData[key.trim()] || "");
  }
  // デフォルト: フォーム名 + 全フィールド（空でないもの）
  const fields = Object.entries(rowData)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `*${k}*: ${v}`)
    .join("\n");
  return `*${automationName}*\n\n${fields}`;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allAutomations, error: fetchError } = await db
    .from("automations")
    .select("*")
    .limit(200);

  if (fetchError) {
    return NextResponse.json({
      success: false,
      message: "Failed to fetch automations",
      error: fetchError.message,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const automations = (allAutomations || []).filter((a: any) => a.is_active === true);

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
      // ★ 初回実行（last_synced_row = 0）の場合、既存データをスキップして
      //   現在の行数を記録するだけにする（過去データの一斉送信を防止）
      if (automation.last_synced_row === 0 || automation.last_synced_row === null) {
        const allRows = await fetchSheetData(
          automation.spreadsheet_id,
          automation.sheet_name
        );
        const currentRowCount = allRows.length > 0 ? allRows.length - 1 : 0; // ヘッダー除く
        const headers = allRows.length > 0 ? allRows[0] : [];

        await db
          .from("automations")
          .update({
            last_synced_row: currentRowCount + 1, // 次回は新しい行のみ
            known_headers: headers,
            updated_at: new Date().toISOString(),
          })
          .eq("id", automation.id);

        await db.from("automation_logs").insert({
          automation_id: automation.id,
          status: "initialized",
          new_rows_count: 0,
          notifications_sent: 0,
          details: { skipped_existing: currentRowCount, reason: "first_run_skip" },
        });

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
        // 新しい行なし
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

      // ★ 安全上限: 1回の実行で送信する通知数を制限（異常な大量送信を防止）
      const MAX_NOTIFICATIONS_PER_RUN = 20;
      if (dataRows.length > MAX_NOTIFICATIONS_PER_RUN) {
        console.warn(
          `[sync-automations] ${automation.name}: ${dataRows.length} rows detected, exceeds limit of ${MAX_NOTIFICATIONS_PER_RUN}. Skipping to prevent mass notification.`
        );

        // last_synced_rowを進めて次回から新規行のみ処理
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
      let newRowsCount = 0;

      for (const row of dataRows) {
        // 空行スキップ
        if (row.every((cell: string) => !cell || cell.trim() === "")) continue;
        newRowsCount++;

        // 行データをkey-valueに変換
        const rowData: Record<string, string> = {};
        headers.forEach((h: string, i: number) => {
          if (i < row.length && row[i]) rowData[h] = row[i];
        });

        // Slack通知送信
        const message = buildSlackMessage(
          automation.name,
          rowData,
          automation.message_template
        );
        await sendSlackMessage(automation.slack_channel_id, message);
        await checkAndSendEscalation(automation.name, rowData, automation.slack_channel_id);
        notificationsSent++;

        // Slack APIレートリミット対策（1秒1回制限）
        if (notificationsSent < dataRows.length) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      // last_synced_row更新
      const totalRow = automation.last_synced_row + dataRows.length;

      await db
        .from("automations")
        .update({
          last_synced_row: totalRow,
          last_triggered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", automation.id);

      // ログ記録
      await db.from("automation_logs").insert({
        automation_id: automation.id,
        status: "success",
        new_rows_count: newRowsCount,
        notifications_sent: notificationsSent,
        details: { headers, sample_row: dataRows[0] },
      });

      results.push({
        name: automation.name,
        new_rows: newRowsCount,
        notifications: notificationsSent,
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
