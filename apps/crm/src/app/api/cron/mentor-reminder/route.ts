import { createServiceClient } from "@/lib/supabase/server";
import { sendSlackDM, logNotification, isSystemAutomationEnabled } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/mentor-reminder
 * メンターリマインド:
 * - coaching_end_date の30日前 → メンターにDM
 * - coaching_end_date = 今日 → メンターにDM（指導最終日）
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("mentor-reminder"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // 30日後の日付（= coaching_end_dateがその日なら30日前通知）
  const thirtyDaysLater = new Date(now);
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  const thirtyDaysLaterStr = thirtyDaysLater.toISOString().slice(0, 10);

  const results = {
    thirty_day_warnings: 0,
    last_day_notices: 0,
  };

  // ============================================================
  // 1. coaching_end_date = 30日後 → 事前通知
  // ============================================================
  const { data: thirtyDayTargets } = await supabase
    .from("mentors")
    .select("id, mentor_name, slack_user_id, customer_id, customers!inner(name)")
    .eq("coaching_end_date", thirtyDaysLaterStr);

  if (thirtyDayTargets && thirtyDayTargets.length > 0) {
    for (const row of thirtyDayTargets) {
      const slackUserId = row.slack_user_id;
      if (!slackUserId) continue;

      const customerName = (row.customers as any)?.name || "不明";
      const msg = [
        `📋 *指導期間終了30日前のお知らせ*`,
        `受講者: ${customerName}`,
        `指導終了日: ${thirtyDaysLaterStr}`,
        `指導期間の終了が30日後に迫っています。`,
        `必要な対応をご確認ください。`,
      ].join("\n");

      await sendSlackDM(slackUserId, msg);
      await logNotification({
        type: "mentor_reminder_30d",
        recipient: slackUserId,
        customer_id: row.customer_id,
        message: msg,
        status: "success",
        metadata: { mentor_name: row.mentor_name, coaching_end_date: thirtyDaysLaterStr },
      });
      results.thirty_day_warnings++;
    }
  }

  // ============================================================
  // 2. coaching_end_date = 今日 → 最終日通知
  // ============================================================
  const { data: lastDayTargets } = await supabase
    .from("mentors")
    .select("id, mentor_name, slack_user_id, customer_id, customers!inner(name)")
    .eq("coaching_end_date", today);

  if (lastDayTargets && lastDayTargets.length > 0) {
    for (const row of lastDayTargets) {
      const slackUserId = row.slack_user_id;
      if (!slackUserId) continue;

      const customerName = (row.customers as any)?.name || "不明";
      const msg = [
        `🔔 *本日が指導最終日です*`,
        `受講者: ${customerName}`,
        `指導終了日: ${today}`,
        `本日で指導期間が終了します。最終報告の提出をお願いします。`,
      ].join("\n");

      await sendSlackDM(slackUserId, msg);
      await logNotification({
        type: "mentor_reminder_lastday",
        recipient: slackUserId,
        customer_id: row.customer_id,
        message: msg,
        status: "success",
        metadata: { mentor_name: row.mentor_name, coaching_end_date: today },
      });
      results.last_day_notices++;
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    results,
    timestamp: now.toISOString(),
  });
}
