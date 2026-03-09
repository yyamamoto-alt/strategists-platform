import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchSheetData } from "@/lib/google-sheets";
import { sendSlackMessage } from "@/lib/slack";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  const { data: automations, error: fetchError } = await db
    .from("automations")
    .select("*")
    .eq("is_active", true)
    .limit(100);

  if (fetchError || !automations || automations.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No active automations",
      processed: 0,
    });
  }

  const results = [];

  for (const automation of automations) {
    try {
      const startRow =
        automation.last_synced_row > 0
          ? automation.last_synced_row + 1
          : undefined;

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
        notificationsSent++;

        // Slack APIレートリミット対策（1秒1回制限）
        if (notificationsSent < dataRows.length) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      // last_synced_row更新
      const totalRow = startRow
        ? automation.last_synced_row + dataRows.length
        : dataRows.length + 1;

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
