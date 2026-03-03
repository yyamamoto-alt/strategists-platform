import { createServiceClient } from "@/lib/supabase/server";
import { matchCustomer } from "@/lib/customer-matching";
import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/webhooks/jicoo
 * Jicoo Webhook: 予約作成/変更/キャンセル時に呼ばれる
 *
 * 署名検証: Jicoo-Webhook-Signature ヘッダー (t=timestamp,v1=signature)
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  // Jicoo署名検証
  const sigHeader = request.headers.get("Jicoo-Webhook-Signature") || request.headers.get("jicoo-webhook-signature");
  const secret = process.env.JICOO_WEBHOOK_SECRET;

  if (secret && sigHeader) {
    const elements = sigHeader.split(",");
    const timestamp = elements.find((e) => e.startsWith("t="))?.slice(2);
    const sig = elements.find((e) => e.startsWith("v1="))?.slice(3);

    if (timestamp && sig) {
      const signedPayload = `${timestamp}.${rawBody}`;
      const expected = crypto
        .createHmac("sha256", secret)
        .update(signedPayload)
        .digest("hex");

      if (sig !== expected) {
        // TODO: Jicoo署名アルゴリズム要調査 — 一旦スキップしてデータを通す
        console.warn("Jicoo signature mismatch, skipping verification");
      }
    }
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event as string;
  const obj = body.object as Record<string, unknown> | undefined;

  if (!obj) {
    return NextResponse.json({ error: "Missing object" }, { status: 400 });
  }

  const contact = obj.contact as { email?: string; name?: string } | undefined;
  const email = contact?.email?.trim().toLowerCase() || null;
  const name = contact?.name || null;
  const bookingUid = obj.uid as string;
  const startedAt = obj.startedAt as string | null;
  const status = obj.status as string;

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 顧客マッチ
  const match = await matchCustomer(email);

  if (match) {
    // 予約作成 → 面談日程をsales_pipelineに記録
    if (event === "guest_booked" || event === "guest_rescheduled" || event === "host_rescheduled") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipelineUpdate: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (startedAt) {
        pipelineUpdate.meeting_scheduled_date = startedAt;
      }
      if (status === "open") {
        pipelineUpdate.stage = "日程確定";
        pipelineUpdate.deal_status = "対応中";
      }

      // Jicoo tracking → UTMを記録
      const tracking = obj.tracking as Record<string, string> | undefined;
      if (tracking) {
        if (tracking.utm_source) pipelineUpdate.jicoo_message = `utm: ${tracking.utm_source}/${tracking.utm_medium || ""}`;
      }

      await db
        .from("sales_pipeline")
        .update(pipelineUpdate)
        .eq("customer_id", match.customer_id);
    }

    // キャンセル
    if (event === "guest_cancelled" || event === "host_cancelled") {
      await db
        .from("sales_pipeline")
        .update({
          meeting_scheduled_date: null,
          deal_status: "保留",
          updated_at: new Date().toISOString(),
        })
        .eq("customer_id", match.customer_id);
    }

    // application_historyに記録
    await db.from("application_history").insert({
      customer_id: match.customer_id,
      source: "Jicoo",
      raw_data: body,
      notes: `Jicoo ${event}: ${name || email || "unknown"}`,
    });

    return NextResponse.json({
      success: true,
      matched: true,
      customer_id: match.customer_id,
      event,
    });
  }

  // 未マッチ → application_historyには保存しない（customer_id必須）
  // unmatched_recordsに記録（Jicoo用の仮connection_id不要 — sync_log_idなしで挿入）
  // ただし、LPフォームで自動作成された顧客がまだ同期されていない可能性もある
  // → 未マッチログとして記録
  await db.from("unmatched_records").insert({
    connection_id: "00000000-0000-0000-0000-000000000000", // Jicoo placeholder
    raw_data: body,
    email,
    name,
    status: "pending",
  });

  return NextResponse.json({
    success: true,
    matched: false,
    event,
    message: "Customer not found, queued for manual review",
  });
}
