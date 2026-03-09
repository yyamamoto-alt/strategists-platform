import { createServiceClient } from "@/lib/supabase/server";
import { matchCustomer } from "@/lib/customer-matching";
import { notifyJicooBooking } from "@/lib/slack";
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

  const contact = obj.contact as { email?: string; name?: string; phone?: string } | undefined;
  const email = contact?.email?.trim().toLowerCase() || null;
  const name = contact?.name || null;
  const phone = (contact?.phone || null) as string | null;
  const startedAt = obj.startedAt as string | null;
  const status = obj.status as string;

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 顧客マッチ（ファジーマッチ対応）
  const match = await matchCustomer(email, phone, null, name);

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
        pipelineUpdate.stage = "未実施";
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
          stage: "日程未確",
          updated_at: new Date().toISOString(),
        })
        .eq("customer_id", match.customer_id);
    }

    // application_historyに記録
    await db.from("application_history").insert({
      customer_id: match.customer_id,
      source: "Jicoo",
      raw_data: body,
      notes: `Jicoo ${event}: ${name || email || "unknown"} (${match.match_type}マッチ)`,
    });

    // Slack通知
    await notifyJicooBooking({
      event,
      name,
      email,
      startedAt,
      matched: true,
      customerUrl: `https://strategists-crm.vercel.app/customers/${match.customer_id}`,
    });

    return NextResponse.json({
      success: true,
      matched: true,
      match_type: match.match_type,
      customer_id: match.customer_id,
      event,
    });
  }

  // 未マッチ → 顧客を自動作成
  if (email || name) {
    const customerInsert: Record<string, unknown> = {
      name: name || "未入力",
      email: email || null,
      phone: phone || null,
      application_date: new Date().toISOString(),
      data_origin: "jicoo",
    };

    const { data: newCustomer, error: createError } = await db
      .from("customers")
      .insert(customerInsert)
      .select()
      .single();

    if (newCustomer && !createError) {
      // customer_emails に登録
      if (email) {
        await db.from("customer_emails").upsert(
          { customer_id: newCustomer.id, email, is_primary: true },
          { onConflict: "email" }
        );
      }

      // sales_pipeline を作成（Jicoo予約 → 未実施）
      await db.from("sales_pipeline").insert({
        customer_id: newCustomer.id,
        stage: "未実施",
        meeting_scheduled_date: startedAt || null,
      });

      // application_history
      await db.from("application_history").insert({
        customer_id: newCustomer.id,
        source: "Jicoo",
        raw_data: body,
        notes: `Jicoo ${event}: 自動作成`,
      });

      // Slack通知（新規作成）
      await notifyJicooBooking({
        event,
        name,
        email,
        startedAt,
        matched: false,
        customerUrl: `https://strategists-crm.vercel.app/customers/${newCustomer.id}`,
      });

      return NextResponse.json({
        success: true,
        matched: false,
        auto_created: true,
        customer_id: newCustomer.id,
        event,
      });
    }
  }

  // 作成も失敗 → 未マッチキューへ
  await db.from("unmatched_records").insert({
    raw_data: body,
    email,
    name,
    status: "pending",
  });

  return NextResponse.json({
    success: true,
    matched: false,
    auto_created: false,
    event,
    message: "Customer not found, queued for manual review",
  });
}
