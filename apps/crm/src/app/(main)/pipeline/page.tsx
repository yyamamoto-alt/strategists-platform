export const dynamic = "force-dynamic";

import { fetchCustomersWithRelations } from "@/lib/data/customers";
import { createServiceClient } from "@/lib/supabase/server";
import { PipelineClient } from "./pipeline-client";

export const revalidate = 60;

/** 自動ステージ変更ルール */
async function applyAutoStageChanges() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const today = new Date();
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0, 10);
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
  const oneMonthAgoStr = oneMonthAgo.toISOString().slice(0, 10);

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
      .update({ stage: "失注見込(自動)" })
      .in("id", ids);
  }

  // ルール2: 日程未設定 + 申込から1ヶ月経過 → 実施不可
  // (未実施/日程未確/問い合わせで、meeting_scheduled_dateがNULL、application_dateが1ヶ月以上前)
  const { data: staleRecords } = await db
    .from("sales_pipeline")
    .select("id, customer_id, stage, meeting_scheduled_date, customers!inner(application_date)")
    .in("stage", ["未実施", "日程未確", "問い合わせ"])
    .is("meeting_scheduled_date", null)
    .lt("customers.application_date", oneMonthAgoStr) as { data: { id: string }[] | null };

  if (staleRecords && staleRecords.length > 0) {
    const ids = staleRecords.map((r: { id: string }) => r.id);
    await db
      .from("sales_pipeline")
      .update({ stage: "実施不可" })
      .in("id", ids);
  }
}

export default async function PipelinePage() {
  // 自動ステージ変更を適用してからデータ取得
  await applyAutoStageChanges();
  const customers = await fetchCustomersWithRelations();
  return <PipelineClient customers={customers} />;
}
