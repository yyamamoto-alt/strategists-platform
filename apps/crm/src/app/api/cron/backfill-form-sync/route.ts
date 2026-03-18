import { createServiceClient } from "@/lib/supabase/server";
import { processFormRecord } from "@/lib/process-form-record";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * フォームデータ → 関連テーブル一括バックフィル
 *
 * application_history の各レコードに対して processFormRecord() を呼び出す。
 * 各customer×sourceで最新レコードのみ処理。
 *
 * processFormRecord() が全ての関連テーブル更新を担当するため、
 * このcronはレコードの選定と呼び出しだけが責務。
 */

const BACKFILL_SOURCES = [
  "カルテ",
  "営業報告",
  "入塾フォーム",
  "メンター指導報告",
  "指導終了報告",
  "エージェント面談報告フォーム",
  "課題提出",
];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const stats: Record<string, number> = {};
  let errors = 0;

  for (const source of BACKFILL_SOURCES) {
    stats[source] = 0;

    try {
      // 各ソースの全レコードを取得（最新順）
      const { data: records } = await db
        .from("application_history")
        .select("id, customer_id")
        .eq("source", source)
        .order("applied_at", { ascending: false });

      if (!records || records.length === 0) continue;

      // customer_idごとに最新のレコードIDのみ抽出
      const latestByCustomer = new Map<string, string>();
      for (const r of records as { id: string; customer_id: string }[]) {
        if (!latestByCustomer.has(r.customer_id)) {
          latestByCustomer.set(r.customer_id, r.id);
        }
      }

      // processFormRecord() を呼び出し（通知はスキップ）
      for (const historyId of latestByCustomer.values()) {
        try {
          await processFormRecord(historyId, { skipNotification: true });
          stats[source]++;
        } catch {
          errors++;
        }
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ success: true, stats, errors });
}
