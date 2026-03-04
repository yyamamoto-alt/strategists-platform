import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { createServiceClient } from "@/lib/supabase/server";
import { PipelineClient } from "./pipeline-client";
import { mockCustomers } from "@/lib/mock-data";

export const revalidate = 60;

/** 自動ステージ変更: 予定日から2週間経過 → 失注見込(自動) / 予定日NULLかつ未実施 → 日程未確 */
async function applyAutoStageChanges() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const today = new Date();
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0, 10);

  // ルール1: 予定日から2週間経過 → 失注見込(自動)
  const { data: overdueRecords } = await db
    .from("sales_pipeline")
    .select("id, stage, meeting_scheduled_date")
    .in("stage", ["未実施", "日程確定", "問い合わせ"])
    .not("meeting_scheduled_date", "is", null)
    .lt("meeting_scheduled_date", twoWeeksAgoStr) as { data: { id: string }[] | null };

  if (overdueRecords && overdueRecords.length > 0) {
    const ids = overdueRecords.map((r: { id: string }) => r.id);
    await db
      .from("sales_pipeline")
      .update({ stage: "失注見込(自動)", deal_status: "失注見込" })
      .in("id", ids);
  }

  // ルール2: meeting_scheduled_date が NULL かつ stage ∈ [未実施, 問い合わせ] → 日程未確
  const { data: noDateRecords } = await db
    .from("sales_pipeline")
    .select("id, stage, meeting_scheduled_date")
    .in("stage", ["未実施", "問い合わせ"])
    .is("meeting_scheduled_date", null) as { data: { id: string }[] | null };

  if (noDateRecords && noDateRecords.length > 0) {
    const ids = noDateRecords.map((r: { id: string }) => r.id);
    await db
      .from("sales_pipeline")
      .update({ stage: "日程未確" })
      .in("id", ids);
  }
}

export default async function PipelinePage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return <PipelineClient customers={mockCustomers} />;
  }

  // 自動ステージ変更を適用してからデータ取得
  await applyAutoStageChanges();
  const customers = await fetchCustomersWithRelations();
  return <PipelineClient customers={customers} />;
}
