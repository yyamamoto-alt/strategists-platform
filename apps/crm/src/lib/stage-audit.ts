import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

interface AuditEntry {
  customer_id: string;
  old_stage: string | null;
  new_stage: string;
  changed_by: string;
  metadata?: Record<string, unknown>;
}

/**
 * ステージ変更をaudit logに記録
 * 単一レコード用
 */
export async function logStageChange(entry: AuditEntry) {
  const db = createServiceClient() as ReturnType<typeof createServiceClient> & { from: (...args: unknown[]) => unknown };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from("stage_audit_log").insert({
    customer_id: entry.customer_id,
    old_stage: entry.old_stage,
    new_stage: entry.new_stage,
    changed_by: entry.changed_by,
    metadata: entry.metadata || null,
  });
}

/**
 * ステージ変更をaudit logに一括記録
 * Cron/一括変更用
 */
export async function logStageChangeBatch(entries: AuditEntry[]) {
  if (entries.length === 0) return;
  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = db as any;

  // 50件ずつバッチinsert
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50).map((e) => ({
      customer_id: e.customer_id,
      old_stage: e.old_stage,
      new_stage: e.new_stage,
      changed_by: e.changed_by,
      metadata: e.metadata || null,
    }));
    await supabase.from("stage_audit_log").insert(batch);
  }
}
