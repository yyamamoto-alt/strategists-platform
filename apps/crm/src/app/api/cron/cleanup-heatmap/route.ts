import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 90日以上前の heatmap_events を削除 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from("heatmap_events")
    .delete({ count: "exact" })
    .lt("created_at", cutoff.toISOString());

  if (error) {
    console.error("[cleanup-heatmap]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[cleanup-heatmap] Deleted ${count} rows older than 90 days`);
  return NextResponse.json({ deleted: count });
}
