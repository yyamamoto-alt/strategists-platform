import { createServiceClient } from "@/lib/supabase/server";
import { notifyStageTransition, isSystemAutomationEnabled } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 時限ステージ自動遷移 cron
 *
 * | 現ステージ   | 基準日             | 期限   | 遷移先           |
 * |-------------|-------------------|--------|-----------------|
 * | 未実施       | 営業日             | 1ヶ月  | 実施不可          |
 * | 日程未確     | 営業日             | 1ヶ月  | 実施不可          |
 * | 追加指導     | 追加指導日          | 3日   | 失注見込み         |
 * | 検討中       | 返答期限            | 3日   | 失注見込み         |
 * | 検討中       | 営業日(期限なし時)   | 1ヶ月  | 失注見込(自動)     |
 * | 長期検討     | 営業日             | 1ヶ月  | 失注見込(自動)     |
 * | 失注見込     | 営業日             | 1ヶ月  | 失注見込(自動)     |
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("stage-transitions"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const now = new Date();
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const cutoff = oneMonthAgo.toISOString().slice(0, 10);

  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const cutoff3d = threeDaysAgo.toISOString().slice(0, 10);

  const results: Record<string, number> = {};

  // 0a. 追加指導 → 失注見込み（追加指導日から3日経過）
  {
    const { data: coachingTargets, error } = await supabase
      .from("sales_pipeline")
      .select("id")
      .eq("stage", "追加指導")
      .not("additional_coaching_date", "is", null)
      .lt("additional_coaching_date", cutoff3d);

    if (!error && coachingTargets && coachingTargets.length > 0) {
      const ids = coachingTargets.map((r: { id: string }) => r.id);
      const { count } = await supabase
        .from("sales_pipeline")
        .update({ stage: "失注見込み" })
        .in("id", ids);
      results["追加指導→失注見込み(3日超過)"] = count || ids.length;
    }
  }

  // 0b. 検討中 → 失注見込み（返答期限から3日経過）
  {
    const { data: deadlineTargets, error } = await supabase
      .from("sales_pipeline")
      .select("id")
      .eq("stage", "検討中")
      .not("response_deadline", "is", null)
      .lt("response_deadline", cutoff3d);

    if (!error && deadlineTargets && deadlineTargets.length > 0) {
      const ids = deadlineTargets.map((r: { id: string }) => r.id);
      const { count } = await supabase
        .from("sales_pipeline")
        .update({ stage: "失注見込み" })
        .in("id", ids);
      results["検討中→失注見込み(返答期限3日超過)"] = count || ids.length;
    }
  }

  // 1. 未実施/日程未確 → 実施不可（営業日から1ヶ月）
  //    営業日がなければ面談実施日、面談予定日、申込日の順でフォールバック
  const { data: appDateTargets, error: e1 } = await supabase
    .from("sales_pipeline")
    .select("id, customer_id, stage, sales_date, meeting_scheduled_date, customers!inner(application_date)")
    .in("stage", ["未実施", "日程未確"]);

  if (!e1 && appDateTargets && appDateTargets.length > 0) {
    const idsToTransition1: string[] = [];
    for (const r of appDateTargets) {
      const refDate = r.sales_date || r.meeting_scheduled_date || (r.customers as any)?.application_date;
      if (refDate && refDate < cutoff) {
        idsToTransition1.push(r.id);
      }
    }
    if (idsToTransition1.length > 0) {
      const { count } = await supabase
        .from("sales_pipeline")
        .update({ stage: "実施不可" })
        .in("id", idsToTransition1);
      results["未実施/日程未確→実施不可"] = count || idsToTransition1.length;
    }
  }

  // 2. 検討中(返答期限なし)/長期検討/失注見込 → 失注見込(自動)（営業日から1ヶ月）
  //    検討中で返答期限ありの場合は0bで3日ルール適用済みなのでここでは除外
  //    営業日がない場合は面談実施日、それもなければ面談予定日をフォールバック
  const { data: salesDateTargets, error: e2 } = await supabase
    .from("sales_pipeline")
    .select("id, stage, sales_date, meeting_scheduled_date, response_deadline")
    .in("stage", ["検討中", "長期検討", "失注見込"]);

  if (!e2 && salesDateTargets) {
    const idsToTransition: string[] = [];
    for (const r of salesDateTargets) {
      // 検討中で返答期限ありは0bで処理済み → スキップ
      if (r.stage === "検討中" && r.response_deadline) continue;
      const refDate = r.sales_date || r.meeting_scheduled_date;
      if (!refDate) continue;
      if (refDate < cutoff) {
        idsToTransition.push(r.id);
      }
    }
    if (idsToTransition.length > 0) {
      const { count } = await supabase
        .from("sales_pipeline")
        .update({ stage: "失注見込(自動)" })
        .in("id", idsToTransition);
      results["検討中等→失注見込(自動)"] = count || idsToTransition.length;
    }
  }

  // Slack通知
  const totalTransitioned = Object.values(results).reduce((s, n) => s + n, 0);
  if (totalTransitioned > 0) {
    const lines = Object.entries(results).map(([k, v]) => `  ${k}: ${v}件`);
    await notifyStageTransition(
      `📋 ステージ自動遷移: ${totalTransitioned}件\n${lines.join("\n")}`
    );
  }

  return NextResponse.json({
    ok: true,
    cutoff,
    transitions: results,
    timestamp: now.toISOString(),
  });
}
