import { createServiceClient } from "@/lib/supabase/server";
import { sendSlackDM, sendSlackMessage, logNotification, isSystemAutomationEnabled } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** CC受信者: 山本, 亀井, 大橋 */
const CC_RECIPIENTS = ["U03TF7YESK1", "U07GRS0T681", "U08QUA37ZUJ"];

/** edu-reportチャンネル */
const EDU_REPORT_CHANNEL = "C094DA9A9B4";

/** CC受信者全員にDMを送信 */
async function sendCCNotifications(msg: string) {
  for (const userId of CC_RECIPIENTS) {
    try {
      await sendSlackDM(userId, msg);
    } catch (e) {
      console.error(`CC DM failed for ${userId}:`, e);
    }
  }
}

/**
 * GET /api/cron/mentor-reminder
 * メンターリマインド:
 * - coaching_end_date の30日前 → メンターにDM + CC
 * - coaching_end_date = 今日 → メンターにDM（指導最終日）+ CC
 * - reminder_date_1 = 今日 → メンターにDM（リマインド日1）+ CC
 * - 処理完了後、edu-reportチャンネルにサマリー投稿
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
    reminder_date_1_notices: 0,
  };

  const summaryLines: string[] = [];

  // ============================================================
  // 1. coaching_end_date = 30日後 → 事前通知
  // ============================================================
  const { data: thirtyDayTargets } = await supabase
    .from("mentors")
    .select("id, name, slack_user_id, customer_id, customers!inner(name)")
    .eq("coaching_end_date", thirtyDaysLaterStr);

  if (thirtyDayTargets && thirtyDayTargets.length > 0) {
    for (const row of thirtyDayTargets) {
      const slackUserId = row.slack_user_id;
      if (!slackUserId) continue;

      const customerName = (row.customers as any)?.name || "不明";
      const msg = [
        `:warning: *指導期間終了30日前のお知らせ*`,
        `受講者: ${customerName}`,
        `指導終了日: ${thirtyDaysLaterStr}`,
        `指導期間の終了が30日後に迫っています。`,
        `※自動送信です`,
      ].join("\n");

      await sendSlackDM(slackUserId, msg);
      await sendCCNotifications(msg);
      await logNotification({
        type: "mentor_reminder_30d",
        recipient: slackUserId,
        customer_id: row.customer_id,
        message: msg,
        status: "success",
        metadata: { mentor_name: row.name, coaching_end_date: thirtyDaysLaterStr },
      });
      results.thirty_day_warnings++;
      summaryLines.push(`• 30日前通知: ${customerName}（メンター: ${row.name || "不明"}）`);
    }
  }

  // ============================================================
  // 2. coaching_end_date = 今日 → 最終日通知
  // ============================================================
  const { data: lastDayTargets } = await supabase
    .from("mentors")
    .select("id, name, slack_user_id, customer_id, customers!inner(name)")
    .eq("coaching_end_date", today);

  if (lastDayTargets && lastDayTargets.length > 0) {
    for (const row of lastDayTargets) {
      const slackUserId = row.slack_user_id;
      if (!slackUserId) continue;

      const customerName = (row.customers as any)?.name || "不明";
      const msg = [
        `:warning: *本日が指導最終日です*`,
        `受講者: ${customerName}`,
        `指導終了日: ${today}`,
        `本日で指導期間が終了します。最終報告の提出をお願いします。`,
        `※自動送信です`,
      ].join("\n");

      await sendSlackDM(slackUserId, msg);
      await sendCCNotifications(msg);
      await logNotification({
        type: "mentor_reminder_lastday",
        recipient: slackUserId,
        customer_id: row.customer_id,
        message: msg,
        status: "success",
        metadata: { mentor_name: row.name, coaching_end_date: today },
      });
      results.last_day_notices++;
      summaryLines.push(`• 最終日通知: ${customerName}（メンター: ${row.name || "不明"}）`);
    }
  }

  // ============================================================
  // 3. reminder_date_1 = 今日 → リマインド日1通知
  // ============================================================
  const { data: reminderDate1Targets } = await supabase
    .from("learning_records")
    .select("customer_id, coaching_start_date, coaching_end_date, total_sessions, completed_sessions, reminder_date_1, customers!inner(name)")
    .eq("reminder_date_1", today);

  if (reminderDate1Targets && reminderDate1Targets.length > 0) {
    for (const record of reminderDate1Targets) {
      const customerName = (record.customers as any)?.name || "不明";
      const customerId = record.customer_id;

      // customer_idからメンターを検索
      const { data: mentorData } = await supabase
        .from("mentors")
        .select("id, name, slack_user_id")
        .eq("customer_id", customerId)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!mentorData?.slack_user_id) continue;

      const sessionsInfo = record.total_sessions && record.completed_sessions != null
        ? `\n進捗: ${record.completed_sessions}/${record.total_sessions}回完了`
        : "";

      const msg = [
        `:warning: *リマインド日のお知らせ*`,
        `受講者: ${customerName}`,
        `指導開始日: ${record.coaching_start_date || "未設定"}`,
        `指導終了日: ${record.coaching_end_date || "未設定"}`,
        `${sessionsInfo}`,
        `リマインド日に達しました。受講者の進捗をご確認ください。`,
        `※自動送信です`,
      ].filter(Boolean).join("\n");

      await sendSlackDM(mentorData.slack_user_id, msg);
      await sendCCNotifications(msg);
      await logNotification({
        type: "mentor_reminder_date_1",
        recipient: mentorData.slack_user_id,
        customer_id: customerId,
        message: msg,
        status: "success",
        metadata: {
          mentor_name: mentorData.name,
          reminder_date_1: today,
          coaching_end_date: record.coaching_end_date,
        },
      });
      results.reminder_date_1_notices++;
      summaryLines.push(`• リマインド日1: ${customerName}（メンター: ${mentorData.name || "不明"}）`);
    }
  }

  // ============================================================
  // 4. edu-reportチャンネルにサマリー投稿
  // ============================================================
  const totalNotifications =
    results.thirty_day_warnings + results.last_day_notices + results.reminder_date_1_notices;

  if (totalNotifications > 0) {
    const summary = [
      `📊 *メンターリマインド日次サマリー* (${today})`,
      ``,
      `30日前通知: ${results.thirty_day_warnings}件`,
      `最終日通知: ${results.last_day_notices}件`,
      `リマインド日1通知: ${results.reminder_date_1_notices}件`,
      `合計: ${totalNotifications}件`,
      ``,
      ...summaryLines,
    ].join("\n");

    await sendSlackMessage(EDU_REPORT_CHANNEL, summary);
  } else {
    await sendSlackMessage(
      EDU_REPORT_CHANNEL,
      `📊 *メンターリマインド日次サマリー* (${today})\n該当なし（通知0件）`
    );
  }

  return NextResponse.json({
    ok: true,
    date: today,
    results,
    timestamp: now.toISOString(),
  });
}
