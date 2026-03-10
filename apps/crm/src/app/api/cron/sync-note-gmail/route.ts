import { createServiceClient } from "@/lib/supabase/server";
import { notifyNotePurchase } from "@/lib/slack";
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

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|tr|td|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBodyFromPayload(payload: GmailMessagePayload): string {
  // text/plain を優先
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // text/plain がなければ再帰的に探す
    for (const part of payload.parts) {
      const nested = extractBodyFromPayload(part);
      if (nested) return nested;
    }
  }
  // 単一パート（text/html のみの場合も含む）
  if (payload.body?.data) {
    const raw = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      return stripHtml(raw);
    }
    return raw;
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

// --- Zapier準拠: 商品名の正規化 ---

/** 固定価格テーブル（パック/マガジン商品） */
const NOTE_PRICE_MAP: Record<string, number> = {
  "ケース面接/パック": 39800,
  "マッキンゼー/パック": 39800,
  "フェルミ推定/パック": 19800,
  "ケースの教科書4冊セット/パック": 9800,
};

/**
 * Zapier準拠: 商品名を簡略化カテゴリにマッピング
 * - マッキンゼー, フェルミ, ケース面接, ジョブ, ケースの教科書 を検出
 * - パック/教科書/動画講座のタイプ判定
 */
function normalizeProductName(rawName: string): {
  product: string;
  productType: "教科書" | "動画講座" | "マガジン";
} {
  const name = rawName.trim();
  let product = name;
  let productType: "教科書" | "動画講座" | "マガジン" = "マガジン";

  // キーワードマッチで簡略化
  if (name.includes("マッキンゼー")) {
    product = name.includes("パック") ? "マッキンゼー/パック" : "マッキンゼー";
  } else if (name.includes("フェルミ")) {
    product = name.includes("パック") ? "フェルミ推定/パック" : "フェルミ推定";
  } else if (name.includes("ケース面接")) {
    product = name.includes("パック") ? "ケース面接/パック" : "ケース面接";
  } else if (name.includes("ケースの教科書") && name.includes("セット")) {
    product = "ケースの教科書4冊セット/パック";
  } else if (name.includes("ジョブ")) {
    product = "ジョブ型";
  }

  // タイプ判定
  if (name.includes("教科書")) {
    productType = "教科書";
  } else if (name.includes("動画") || name.includes("講座") || name.includes("演習")) {
    productType = "動画講座";
  }

  return { product, productType };
}

/** Google Sheets に行を追加（OAuth認証使用） */
async function appendToNoteSheet(
  accessToken: string,
  data: ParsedNoteOrder,
  normalizedProduct: string,
  productType: string
) {
  const SHEET_ID = "1suAMf79-Cdwu_t0bIH0jHdBHh8w5hjbrnaHPG1bPyis";
  const SHEET_NAME = "note販売";

  // 日付から年月を抽出（例: "2026/03"）
  const paidDate = new Date(data.paidAt);
  const yearMonth = `${paidDate.getFullYear()}/${String(paidDate.getMonth() + 1).padStart(2, "0")}`;

  // JST日時フォーマット
  const jstDate = paidDate.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  // 行データ: [年月, 日時, 購入者, 商品名, 商品タイプ, 金額, 注文ID]
  const values = [[
    `=TEXT(DATEVALUE(LEFT(B2,10)),"yyyy/mm")`,
    jstDate,
    data.buyerName,
    normalizedProduct,
    productType,
    data.amount,
    data.orderId,
  ]];

  try {
    const resp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/'${encodeURIComponent(SHEET_NAME)}'!A2:G2:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      }
    );
    if (!resp.ok) {
      console.warn("Failed to append to note sheet:", await resp.text());
    }
  } catch (e) {
    console.warn("Note sheet append error:", e);
  }
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
        // snippet をフォールバックとして結合（body のパースが不完全な場合に使う）
        const textForParse = body || fullMsg.snippet || "";

        if (!textForParse) {
          errors.push(`Empty body for message ${msg.id}`);
          rowsUnmatched++;
          continue;
        }

        rowsProcessed++;

        // パース（body で失敗したら snippet でリトライ）
        let parsed = parseNoteOrderFromBody(textForParse, subject);
        if (!parsed && body && fullMsg.snippet) {
          parsed = parseNoteOrderFromBody(fullMsg.snippet, subject);
        }
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

        // 商品名正規化（Zapier準拠）
        const { product: normalizedProduct, productType } = normalizeProductName(parsed.productName);

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
              product_name: normalizedProduct,
              contact_name: parsed.buyerName,
              match_status: "not_applicable",
              raw_data: {
                gmail_message_id: msg.id,
                subject,
                body,
                original_product_name: parsed.productName,
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

          // Slack通知（Zapier準拠: #note購入通知 チャンネルに通知）
          const noteType = subject.includes("記事") ? "記事" as const : "マガジン" as const;
          await notifyNotePurchase({
            product: normalizedProduct,
            price: parsed.amount,
            buyer: parsed.buyerName,
            type: noteType,
          });

          // Google Sheets書き込み（Zapier準拠: 売上管理 > note販売）
          try {
            await appendToNoteSheet(accessToken, parsed, normalizedProduct, productType);
          } catch (sheetErr) {
            console.warn("Sheet append failed:", sheetErr);
          }
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
