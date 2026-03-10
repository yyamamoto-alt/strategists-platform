import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// --- Types ---

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailListResponse {
  messages?: GmailMessage[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailMessagePayload {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePayload[];
}

interface GmailFullMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: GmailMessagePayload;
}

interface ParsedNoteOrder {
  buyerName: string;
  orderId: string;
  paidAt: string; // ISO string
  productName: string;
  amount: number;
  orderType: string;
}

// --- Helpers ---

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractBodyFromPayload(payload: GmailMessagePayload): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      const nested = extractBodyFromPayload(part);
      if (nested) return nested;
    }
  }
  return "";
}

function getHeader(
  payload: GmailMessagePayload,
  name: string
): string | undefined {
  return payload.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  )?.value;
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Gmail OAuth credentials (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN)"
    );
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to refresh access token: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

function parseNoteOrderFromBody(
  body: string,
  subject: string
): ParsedNoteOrder | null {
  // 購入者名
  const nameMatch = body.match(
    /(.+?)\s*さんがあなたの(?:記事|マガジン)を購入しました/
  );
  if (!nameMatch) return null;
  const buyerName = nameMatch[1].trim();

  // 注文ID
  const orderIdMatch = body.match(/注文ID：\s*\n?\s*([a-f0-9]+)/);
  if (!orderIdMatch) return null;
  const orderId = orderIdMatch[1];

  // 注文日時
  const dateMatch = body.match(
    /注文日時：\s*\n?\s*(\d{4})年(\d{2})月(\d{2})日\s*(\d{2})時(\d{2})分/
  );
  if (!dateMatch) return null;
  const [, year, month, day, hour, minute] = dateMatch;
  // JST (+09:00)
  const paidAt = `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;

  // 商品と金額
  const productMatch = body.match(/商品：\s*\n?\s*(.+?)\s*\/\s*([\d,]+)円/);
  if (!productMatch) return null;
  const productName = productMatch[1].trim();
  const amount = parseInt(productMatch[2].replace(/,/g, ""), 10);

  // 商品タイプ判定（件名から）
  let orderType = "other";
  if (subject.includes("マガジン")) {
    orderType = "note_magazine";
  } else if (subject.includes("記事")) {
    // 記事の場合、商品名で教科書か動画かを判定
    if (
      productName.includes("動画") ||
      productName.includes("講座") ||
      productName.includes("演習")
    ) {
      orderType = "note_video";
    } else {
      orderType = "note_textbook";
    }
  }

  return {
    buyerName,
    orderId,
    paidAt: new Date(paidAt).toISOString(),
    productName,
    amount,
    orderType,
  };
}

// --- Main Handler ---

export async function GET(request: Request) {
  // Vercel Cron認証チェック
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const startedAt = new Date().toISOString();

  let rowsProcessed = 0;
  let rowsCreated = 0;
  let rowsUpdated = 0;
  let rowsUnmatched = 0;
  const skippedDuplicates: string[] = [];
  const errors: string[] = [];

  try {
    // 1. Gmail API認証
    const accessToken = await getAccessToken();

    // 2. メール検索（直近30日）
    const thirtyDaysAgo = Math.floor(
      (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000
    );
    const query = `from:noreply@note.com subject:購入されました after:${thirtyDaysAgo}`;

    const listResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!listResp.ok) {
      const text = await listResp.text();
      throw new Error(`Gmail list failed: ${listResp.status} ${text}`);
    }

    const listData = (await listResp.json()) as GmailListResponse;
    const messages = listData.messages || [];

    if (messages.length === 0) {
      // sync_log記録（0件）
      await db.from("sync_logs").insert({
        connection_id: null,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: "success",
        rows_processed: 0,
        rows_created: 0,
        rows_updated: 0,
        rows_unmatched: 0,
        details: { source: "note_gmail", message: "No messages found" },
      });

      return NextResponse.json({
        success: true,
        message: "No note purchase emails found",
        rows_processed: 0,
        rows_created: 0,
      });
    }

    // 3. 既存の注文IDを取得（重複チェック用）
    const { data: existingOrders } = await db
      .from("orders")
      .select("source_record_id")
      .eq("source", "note")
      .not("source_record_id", "is", null);
    const existingIds = new Set(
      (existingOrders || []).map(
        (o: { source_record_id: string }) => o.source_record_id
      )
    );

    // 4. 各メールを処理
    for (const msg of messages) {
      try {
        // メール詳細を取得
        const msgResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (!msgResp.ok) {
          errors.push(`Failed to fetch message ${msg.id}: ${msgResp.status}`);
          continue;
        }

        const fullMsg = (await msgResp.json()) as GmailFullMessage;
        const subject = getHeader(fullMsg.payload, "Subject") || "";
        const body = extractBodyFromPayload(fullMsg.payload);

        if (!body) {
          errors.push(`Empty body for message ${msg.id}`);
          rowsUnmatched++;
          continue;
        }

        rowsProcessed++;

        // パース
        const parsed = parseNoteOrderFromBody(body, subject);
        if (!parsed) {
          errors.push(
            `Failed to parse message ${msg.id}: ${subject.substring(0, 50)}`
          );
          rowsUnmatched++;
          continue;
        }

        // 重複チェック
        if (existingIds.has(parsed.orderId)) {
          skippedDuplicates.push(parsed.orderId);
          continue;
        }

        // DB保存
        const { data: upsertResult, error: insertError } = await db
          .from("orders")
          .upsert(
            {
              source: "note",
              source_record_id: parsed.orderId,
              amount: parsed.amount,
              status: "paid",
              payment_method: "other",
              paid_at: parsed.paidAt,
              order_type: parsed.orderType,
              product_name: parsed.productName,
              contact_name: parsed.buyerName,
              match_status: "not_applicable",
              raw_data: {
                gmail_message_id: msg.id,
                subject,
                body,
              },
            },
            { onConflict: "source,source_record_id", ignoreDuplicates: true }
          )
          .select("id");

        if (insertError) {
          console.error(`Order insert error for ${parsed.orderId}:`, insertError);
          errors.push(
            `Insert error for ${parsed.orderId}: ${insertError.message}`
          );
          rowsUnmatched++;
        } else if (upsertResult && upsertResult.length > 0) {
          rowsCreated++;
          existingIds.add(parsed.orderId);
        } else {
          // ignoreDuplicates で既存をスキップ
          skippedDuplicates.push(parsed.orderId);
        }
      } catch (msgErr) {
        const errMsg =
          msgErr instanceof Error ? msgErr.message : "Unknown error";
        console.error(`Error processing message ${msg.id}:`, msgErr);
        errors.push(`Message ${msg.id}: ${errMsg}`);
      }
    }

    // 5. revalidateTag
    if (rowsCreated > 0) {
      revalidateTag("orders");
      revalidateTag("dashboard");
    }

    // 6. sync_logs記録
    await db.from("sync_logs").insert({
      connection_id: null,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "success",
      rows_processed: rowsProcessed,
      rows_created: rowsCreated,
      rows_updated: rowsUpdated,
      rows_unmatched: rowsUnmatched,
      details: {
        source: "note_gmail",
        total_messages: messages.length,
        skipped_duplicates: skippedDuplicates.length,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      rows_processed: rowsProcessed,
      rows_created: rowsCreated,
      rows_updated: rowsUpdated,
      rows_unmatched: rowsUnmatched,
      skipped_duplicates: skippedDuplicates.length,
      total_messages: messages.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("sync-note-gmail error:", err);

    // エラー時もsync_logsに記録
    try {
      await db.from("sync_logs").insert({
        connection_id: null,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: "failed",
        rows_processed: rowsProcessed,
        rows_created: rowsCreated,
        rows_updated: rowsUpdated,
        rows_unmatched: rowsUnmatched,
        error_message: message.substring(0, 500),
        details: { source: "note_gmail" },
      });
    } catch {
      // sync_log記録失敗は無視
    }

    // Vercel Cronの仕様: エラー時も200を返す
    return NextResponse.json({
      success: false,
      error: message,
      rows_processed: rowsProcessed,
      rows_created: rowsCreated,
    });
  }
}
