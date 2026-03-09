import { createServiceClient } from "@/lib/supabase/server";
import { notifyStageTransition, isSystemAutomationEnabled } from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 時限ステージ自動遷移 cron
 *
 * | 現ステージ   | 基準日         | 期限   | 遷移先           |
 * |-------------|---------------|--------|-----------------|
 * | 未実施       | 営業日         | 1ヶ月  | 実施不可          |
 * | 日程未確     | 営業日         | 1ヶ月  | 実施不可          |
 * | 検討中       | 営業日         | 1ヶ月  | 失注見込(自動)     |
 * | 長期検討     | 営業日         | 1ヶ月  | 失注見込(自動)     |
 * | 失注見込     | 営業日         | 1ヶ月  | 失注見込(自動)     |
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

  const results: Record<string, number> = {};

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

  // 2. 検討中/長期検討/失注見込 → 失注見込(自動)（営業日から1ヶ月）
  //    営業日がない場合は面談実施日、それもなければ面談予定日をフォールバック
  const { data: salesDateTargets, error: e2 } = await supabase
    .from("sales_pipeline")
    .select("id, stage, sales_date, meeting_scheduled_date")
    .in("stage", ["検討中", "長期検討", "失注見込"]);

  if (!e2 && salesDateTargets) {
    const idsToTransition: string[] = [];
    for (const r of salesDateTargets) {
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
