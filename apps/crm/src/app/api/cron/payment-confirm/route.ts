import { createServiceClient } from "@/lib/supabase/server";
import {
  sendSlackDM,
  sendSlackMessage,
  getStaffSlackMapping,
  logNotification,
  isSystemAutomationEnabled,
} from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 経営reportチャンネル */
const REPORT_CHANNEL = "C0951QVAJ5N";

/**
 * GET /api/cron/payment-confirm
 * 月次の報酬支払い確認:
 * - staff_slack_mapping に登録された全スタッフにDM送信
 * - 今月の報酬支払い確認を依頼
 * - 経営reportチャンネルにサマリー投稿
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("payment-confirm"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;

  const mapping = await getStaffSlackMapping();
  const staffEntries = Object.entries(mapping);

  if (staffEntries.length === 0) {
    return NextResponse.json({
      ok: true,
      date: today,
      message: "staff_slack_mapping が未設定です",
      results: { staff_notified: 0 },
      timestamp: now.toISOString(),
    });
  }

  const results = {
    staff_notified: 0,
    staff_failed: 0,
  };

  const dmMessage = [
    `💰 *${monthLabel}の報酬支払い確認*`,
    ``,
    `今月の報酬支払い確認をお願いします。`,
    `問題がある場合は経理までご連絡ください。`,
    ``,
    `確認期限: ${monthLabel}末日`,
  ].join("\n");

  // 各スタッフにDM送信
  const notifiedNames: string[] = [];
  const failedNames: string[] = [];

  for (const [staffName, slackUserId] of staffEntries) {
    try {
      await sendSlackDM(slackUserId, dmMessage);
      await logNotification({
        type: "payment_confirm",
        recipient: slackUserId,
        message: dmMessage,
        status: "success",
        metadata: { staff_name: staffName, month: monthLabel },
      });
      notifiedNames.push(staffName);
      results.staff_notified++;
    } catch (e) {
      console.error(`Failed to send payment confirm DM to ${staffName}:`, e);
      await logNotification({
        type: "payment_confirm",
        recipient: slackUserId,
        message: dmMessage,
        status: "failed",
        error_message: e instanceof Error ? e.message : String(e),
        metadata: { staff_name: staffName, month: monthLabel },
      });
      failedNames.push(staffName);
      results.staff_failed++;
    }
  }

  // 経営reportチャンネルにサマリー投稿
  const summaryLines = [
    `💰 *${monthLabel} 報酬支払い確認 送信完了*`,
    ``,
    `送信日: ${today}`,
    `送信成功: ${results.staff_notified}名`,
  ];

  if (notifiedNames.length > 0) {
    summaryLines.push(`対象: ${notifiedNames.join("、")}`);
  }

  if (failedNames.length > 0) {
    summaryLines.push(`⚠️ 送信失敗: ${failedNames.join("、")}`);
  }

  await sendSlackMessage(REPORT_CHANNEL, summaryLines.join("\n"));

  return NextResponse.json({
    ok: true,
    date: today,
    month: monthLabel,
    results,
    timestamp: now.toISOString(),
  });
}
