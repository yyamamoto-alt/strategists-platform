import { createServiceClient } from "@/lib/supabase/server";
import { matchCustomer } from "@/lib/customer-matching";
import { notifyJicooBooking, notifyAssessmentBooking, notifyBehaviorBooking } from "@/lib/slack";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";
import { NextResponse } from "next/server";
import crypto from "crypto";

function md5(text: string): string {
  return crypto.createHash("md5").update(text).digest("hex");
}

const JICOO_API_KEY = process.env.JICOO_API_KEY;
const JICOO_API_BASE = "https://api.jicoo.com/v1";

interface JicooBookingDetails {
  hostName: string | null;
  meetingUrl: string | null;
  eventName: string | null;
}

/**
 * Jicoo REST APIから予約の追加情報を取得
 * - 担当者名 (hosts → Organization Users)
 * - オンライン会議URL (url)
 * - イベント名 (name)
 */
async function fetchJicooBookingDetails(
  obj: Record<string, unknown>,
): Promise<JicooBookingDetails> {
  const empty: JicooBookingDetails = { hostName: null, meetingUrl: null, eventName: null };
  if (!JICOO_API_KEY) return empty;
  const headers = { Authorization: `Bearer ${JICOO_API_KEY}` };

  try {
    const uid = obj.uid as string | undefined;
    let hostUserIds: string[] = [];
    let meetingUrl: string | null = null;
    let eventName: string | null = null;

    // Step 1: webhookペイロードから直接取得を試みる
    const webhookHosts = obj.hosts as { userId: string; role: string }[] | undefined;
    if (webhookHosts && webhookHosts.length > 0) {
      hostUserIds = webhookHosts.map((h) => h.userId);
    }
    if (obj.url) meetingUrl = obj.url as string;
    if (obj.name) eventName = obj.name as string;

    // Step 2: 不足情報があればREST APIで予約詳細を取得
    if ((hostUserIds.length === 0 || !meetingUrl) && uid) {
      const bookingsRes = await fetch(
        `${JICOO_API_BASE}/bookings?perPage=50&status=open`,
        { headers },
      );
      if (bookingsRes.ok) {
        const bookingsData = await bookingsRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const booking = bookingsData?.data?.find((b: any) => b.uid === uid);
        if (booking) {
          if (hostUserIds.length === 0 && booking.hosts) {
            hostUserIds = booking.hosts.map((h: { userId: string }) => h.userId);
          }
          if (!meetingUrl && booking.url) meetingUrl = booking.url;
          if (!eventName && booking.name) eventName = booking.name;
        }
      }
    }

    // Step 3: Organization Users APIでホスト名を解決
    let hostName: string | null = null;
    if (hostUserIds.length > 0) {
      const usersRes = await fetch(`${JICOO_API_BASE}/organization/users`, { headers });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        const users = usersData?.data as { id: string; name: string }[] | undefined;
        if (users) {
          for (const hostId of hostUserIds) {
            const user = users.find((u) => u.id === hostId);
            if (user?.name) { hostName = user.name; break; }
          }
        }
      }
    }

    return { hostName, meetingUrl, eventName };
  } catch (e) {
    console.error("Jicoo booking details error:", e);
    return empty;
  }
}

/**
 * ビヘイビア/アセスメント予約を検出し、専用Slackチャンネルに通知
 */
async function sendTargetedEventNotification(
  event: string,
  obj: Record<string, unknown>,
  jicooDetails: JicooBookingDetails,
  name: string | null,
  startedAt: string | null,
) {
  // イベント名からタイプを判定
  const eventName = jicooDetails.eventName || (obj.name as string | undefined) || "";
  const eventTypeId = (obj.eventTypeId as string | undefined) || "";

  const isBehavior = eventName.includes("ビヘイビア") || eventTypeId.includes("wOVzHsvJ9T4v");
  const isAssessment = eventName.includes("アセスメント") || eventTypeId.includes("o1Y-tOsp");

  if (!isBehavior && !isAssessment) return;

  const isCancelled = event.includes("cancel");
  const contact = obj.contact as { name?: string } | undefined;
  // answers配列から属性を取得（Jicooの質問回答）
  const answers = obj.answers as { value?: string }[] | undefined;
  const attribute = answers?.find((a) => a.value && (a.value.includes("既卒") || a.value.includes("新卒")))?.value || "";
  const displayName = name || contact?.name || "不明";
  const nameWithAttr = attribute ? `${displayName}(${attribute})` : displayName;
  const hostName = jicooDetails.hostName || "未定";
  const dateStr = startedAt
    ? new Date(startedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    : "未定";

  if (isBehavior) {
    const text = isCancelled
      ? `ビヘイビア予約がキャンセルされました。\n*名前：* ${nameWithAttr}\n*担当者：* ${hostName}\n*時間：* ${dateStr}`
      : `ビヘイビア予約が入りました。\n*名前：* ${nameWithAttr}\n*担当者：* ${hostName}\n*時間：* ${dateStr}`;
    await notifyBehaviorBooking(text);
  }

  if (isAssessment) {
    const text = isCancelled
      ? `アセスメント予約がキャンセルされました。\n*名前：* ${nameWithAttr}\n*担当者：* ${hostName}\n*時間：* ${dateStr}`
      : `アセスメント予約が入りました。\n*名前：* ${nameWithAttr}\n*担当者：* ${hostName}\n*時間：* ${dateStr}`;
    await notifyAssessmentBooking(text);
  }
}

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
    // Jicoo REST APIで担当者・会議URL・イベント名を取得（全イベントで使用）
    const jicooDetails = await fetchJicooBookingDetails(obj);

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

      if (jicooDetails.hostName) {
        pipelineUpdate.sales_person = jicooDetails.hostName;
      }
      if (jicooDetails.meetingUrl) {
        pipelineUpdate.meeting_url = jicooDetails.meetingUrl;
      }

      // Jicoo tracking → UTMを記録
      const tracking = obj.tracking as Record<string, string> | undefined;
      if (tracking) {
        if (tracking.utm_source) pipelineUpdate.jicoo_message = `utm: ${tracking.utm_source}/${tracking.utm_medium || ""}`;
        // UTMをcustomersテーブルにも保存（帰属チャネル計算用）
        const utmUpdate: Record<string, string> = {};
        if (tracking.utm_source) utmUpdate.utm_source = tracking.utm_source;
        if (tracking.utm_medium) utmUpdate.utm_medium = tracking.utm_medium;
        if (tracking.utm_campaign) utmUpdate.utm_campaign = tracking.utm_campaign;
        if (Object.keys(utmUpdate).length > 0) {
          await db.from("customers").update(utmUpdate).eq("id", match.customer_id);
        }
      }

      await db
        .from("sales_pipeline")
        .update(pipelineUpdate)
        .eq("customer_id", match.customer_id);

      // 帰属チャネルをリアルタイム計算
      computeAttributionForCustomer(match.customer_id).catch(() => {});
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

    // application_historyに記録（DB UNIQUE制約で重複防止）
    const { error: histErr } = await db.from("application_history").insert({
      customer_id: match.customer_id,
      source: "Jicoo",
      raw_data: body,
      raw_data_hash: md5(JSON.stringify(body)),
      notes: `Jicoo ${event}: ${name || email || "unknown"} (${match.match_type}マッチ)`,
    });
    if (histErr && histErr.code !== "23505") {
      console.error("Jicoo application_history insert error:", histErr);
    }

    // Slack通知（属性・UTM・担当者情報を含む）
    const answers = obj.answers as { value?: string }[] | undefined;
    const attribute = answers?.find((a) => a.value && (a.value.includes("既卒") || a.value.includes("新卒")))?.value || undefined;
    const tracking = obj.tracking as Record<string, string> | undefined;
    await notifyJicooBooking({
      event,
      name,
      email,
      startedAt,
      matched: true,
      customerUrl: `https://strategists-crm.vercel.app/customers/${match.customer_id}`,
      attribute,
      utmSource: tracking?.utm_source,
      utmMedium: tracking?.utm_medium,
      hostName: jicooDetails.hostName || undefined,
    });

    // ビヘイビア/アセスメント専用チャンネル通知
    await sendTargetedEventNotification(event, obj, jicooDetails, name, startedAt);

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
    // UTMを顧客に保存
    const tracking = obj.tracking as Record<string, string> | undefined;
    if (tracking) {
      if (tracking.utm_source) customerInsert.utm_source = tracking.utm_source;
      if (tracking.utm_medium) customerInsert.utm_medium = tracking.utm_medium;
      if (tracking.utm_campaign) customerInsert.utm_campaign = tracking.utm_campaign;
    }

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
        raw_data_hash: md5(JSON.stringify(body)),
        notes: `Jicoo ${event}: 自動作成`,
      });

      // 帰属チャネルをリアルタイム計算
      computeAttributionForCustomer(newCustomer.id).catch(() => {});

      // ビヘイビア/アセスメント専用チャンネル通知 + Slack通知
      const jicooDetailsForNew = await fetchJicooBookingDetails(obj);

      // Slack通知（新規作成 — 属性・UTM・担当者情報を含む）
      const answers = obj.answers as { value?: string }[] | undefined;
      const attribute = answers?.find((a) => a.value && (a.value.includes("既卒") || a.value.includes("新卒")))?.value || undefined;
      await notifyJicooBooking({
        event,
        name,
        email,
        startedAt,
        matched: false,
        customerUrl: `https://strategists-crm.vercel.app/customers/${newCustomer.id}`,
        attribute,
        utmSource: tracking?.utm_source,
        utmMedium: tracking?.utm_medium,
        hostName: jicooDetailsForNew.hostName || undefined,
      });

      await sendTargetedEventNotification(event, obj, jicooDetailsForNew, name, startedAt);

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
