import { createServiceClient } from "@/lib/supabase/server";
import {
  sendSlackDM,
  sendSlackMessage,
  getStaffSlackMapping,
  findSlackUserId,
  logNotification,
  isSystemAutomationEnabled,
} from "@/lib/slack";
import { logStageChangeBatch } from "@/lib/stage-audit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** CC送信先（固定）: 大橋、佐伯、山本 */
const CC_USER_IDS = ["U08QUA37ZUJ", "U09F6EN8JCU", "U03TF7YESK1"];
/** 営業リマインドチャンネル */
const REMINDER_CHANNEL = "C094YLMKR4K";

/**
 * GET /api/cron/sales-reminder
 * 毎朝の営業リマインド:
 * - response_date = 今日 → 担当者にDM
 * - response_date = 5日前で未対応 → 再通知 (エスカレーション)
 * - response_date = 14日前で未対応 → 自動「失注見込(自動)」+ 通知
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("sales-reminder"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // 5日前・14日前の日付
  const fiveDaysAgo = new Date(now);
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const fiveDaysAgoStr = fiveDaysAgo.toISOString().slice(0, 10);

  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().slice(0, 10);

  const mapping = await getStaffSlackMapping();

  const results = {
    today_reminders: 0,
    five_day_escalations: 0,
    fourteen_day_auto_lost: 0,
  };

  // アクティブなパイプライン（失注系・成約済み・入金済みを除く）
  // 追加指導はリマインド不要（ステージ自動遷移で管理）
  const activeStages = [
    "問い合わせ", "日程未確", "未実施", "検討中", "枠確保",
  ];

  // ============================================================
  // 1. response_date = 今日 → チャンネルにリマインド（担当者メンション + CC）
  // ============================================================
  const { data: todayTargets } = await supabase
    .from("sales_pipeline")
    .select("id, customer_id, sales_person, stage, meeting_result, additional_notes, customers!inner(name, email, attribute)")
    .eq("response_date", today)
    .in("stage", activeStages);

  if (todayTargets && todayTargets.length > 0) {
    for (const row of todayTargets) {
      const customerName = (row.customers as any)?.name || "不明";
      const attribute = (row.customers as any)?.attribute || "不明";
      const salesPerson = row.sales_person || null;
      const slackUserId = findSlackUserId(salesPerson, mapping);
      const mentionStr = slackUserId ? `<@${slackUserId}>` : (salesPerson || "未設定");
      const ccStr = CC_USER_IDS.map((id) => `<@${id}>`).join(" ");

      const msg = [
        `📌 *${customerName}*`,
        `🎓 属性: ${attribute}`,
        `🧑‍💼 担当: ${mentionStr}`,
        `📝 結果: ${row.meeting_result || "未記入"}`,
        `🗒️ メモ: ${row.additional_notes || "なし"}`,
        `連絡予定日なので入会意向を確認してください。確認したらスレッドで返答してください。`,
        `cc: ${ccStr}`,
      ].join("\n");

      await sendSlackMessage(REMINDER_CHANNEL, msg);
      await logNotification({
        type: "sales_reminder",
        channel: REMINDER_CHANNEL,
        customer_id: row.customer_id,
        message: msg,
        status: "success",
        metadata: { sales_person: salesPerson, trigger: "today" },
      });
      results.today_reminders++;
    }
  }

  // ============================================================
  // 2. response_date = 5日前で未変更 → エスカレーション
  // ============================================================
  const { data: fiveDayTargets } = await supabase
    .from("sales_pipeline")
    .select("id, customer_id, sales_person, stage, customers!inner(name)")
    .eq("response_date", fiveDaysAgoStr)
    .in("stage", activeStages);

  if (fiveDayTargets && fiveDayTargets.length > 0) {
    const escalationLines: string[] = [
      `⚠️ *営業フォロー未対応（5日経過）*`,
      ``,
    ];

    for (const row of fiveDayTargets) {
      const customerName = (row.customers as any)?.name || "不明";
      const salesPerson = row.sales_person || "未設定";
      const slackUserId = findSlackUserId(row.sales_person, mapping);

      escalationLines.push(
        `• ${customerName}（担当: ${salesPerson}） — ステージ: ${row.stage}`
      );

      // 担当者にも再DM
      if (slackUserId) {
        await sendSlackDM(
          slackUserId,
          `⚠️ *5日経過リマインド*\n顧客: ${customerName}\n連絡予定日から5日が経過しています。至急対応をお願いします。\n断りの連絡があった場合は、失注処理をしてください。ない場合はリマインドしてください。\nhttps://strategists-crm.vercel.app/customers/${row.customer_id}`
        );
      }
      results.five_day_escalations++;
    }

    // CCメンバーにチャンネル通知
    await sendSlackMessage(REMINDER_CHANNEL, escalationLines.join("\n"));

    // CCメンバーにDM
    for (const ccId of CC_USER_IDS) {
      await sendSlackDM(ccId, escalationLines.join("\n"));
    }
  }

  // ============================================================
  // 3. response_date = 14日前 → 自動失注見込(自動)
  // ============================================================
  const { data: fourteenDayTargets } = await supabase
    .from("sales_pipeline")
    .select("id, customer_id, sales_person, stage, customers!inner(name)")
    .eq("response_date", fourteenDaysAgoStr)
    .in("stage", activeStages);

  if (fourteenDayTargets && fourteenDayTargets.length > 0) {
    const autoLostIds = fourteenDayTargets.map((r: any) => r.id);

    // ステージ更新
    await supabase
      .from("sales_pipeline")
      .update({ stage: "失注見込(自動)", updated_at: new Date().toISOString() })
      .in("id", autoLostIds);

    // Audit log
    logStageChangeBatch(
      fourteenDayTargets.map((r: any) => ({
        customer_id: r.customer_id,
        old_stage: r.stage,
        new_stage: "失注見込(自動)",
        changed_by: "cron-sales-reminder",
      }))
    ).catch(() => {});

    const lostLines: string[] = [
      `🚨 *14日未対応 → 自動失注見込*`,
      `管理DBは自動で失注見込に変わっています。`,
      ``,
    ];

    for (const row of fourteenDayTargets) {
      const customerName = (row.customers as any)?.name || "不明";
      const salesPerson = row.sales_person || "未設定";
      lostLines.push(`• ${customerName}（担当: ${salesPerson}）→ 失注見込(自動)`);

      await logNotification({
        type: "sales_auto_lost",
        customer_id: row.customer_id,
        message: `14日未対応のため自動失注見込: ${customerName}`,
        status: "success",
        metadata: { sales_person: salesPerson },
      });
      results.fourteen_day_auto_lost++;
    }

    await sendSlackMessage(REMINDER_CHANNEL, lostLines.join("\n"));
    for (const ccId of CC_USER_IDS) {
      await sendSlackDM(ccId, lostLines.join("\n"));
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    results,
    timestamp: now.toISOString(),
  });
}
