import { createServiceClient } from "@/lib/supabase/server";
import { matchCustomer, normalizeAttribute, normalizePhone } from "@/lib/customer-matching";
import { processFormRecord } from "@/lib/process-form-record";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function md5(text: string): string {
  return crypto.createHash("md5").update(text).digest("hex");
}

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return JSON.stringify(obj.map(stableStringify));
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return JSON.stringify(
    Object.fromEntries(sorted.map((k) => [k, (obj as Record<string, unknown>)[k]]))
  );
}

/**
 * Google Forms → Apps Script → このWebhook
 *
 * 責務:
 * 1. 認証・バリデーション
 * 2. 重複チェック（raw_data_hash）
 * 3. 顧客マッチング → 顧客作成 or 更新 → customer_emails登録
 * 4. application_history に INSERT
 * 5. processFormRecord() で関連テーブル更新・通知・帰属チャネル計算
 */

/** 新規顧客作成を許可するformName一覧 */
const ALLOW_CREATE_FORMS = new Set([
  "カルテ",
  "LP申込(メインLP)",
  "LP申込(LP3)",
  "LP申込(広告LP)",
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { secret, formName, data } = body;

    // 認証
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!formName || !data || typeof data !== "object") {
      return NextResponse.json(
        { error: "Missing formName or data" },
        { status: 400 }
      );
    }

    const rawData = data as Record<string, string>;
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    // 重複チェック（タイムスタンプ除外してハッシュ計算）
    const { "タイムスタンプ": _ts, ...dataForHash } = rawData;
    const rawHash = md5(stableStringify(dataForHash));
    const { data: existingRecord } = await db
      .from("application_history")
      .select("id")
      .eq("raw_data_hash", rawHash)
      .limit(1);

    if (existingRecord && existingRecord.length > 0) {
      return NextResponse.json({
        success: true,
        action: "skipped",
        reason: "duplicate",
      });
    }

    // 顧客マッチング
    const email = (rawData["メールアドレス"] || "").trim().toLowerCase() || null;
    const name = rawData["お名前"] || null;
    const phone = rawData["電話番号"] ? normalizePhone(rawData["電話番号"]) : null;
    const match = await matchCustomer(email, phone, null, name);
    let customerId: string;
    let isNew = false;

    if (match) {
      customerId = match.customer_id;

      // メールアドレスを customer_emails に追加
      if (email) {
        await db.from("customer_emails").upsert(
          { customer_id: customerId, email, is_primary: false },
          { onConflict: "email" }
        );
      }
    } else if (ALLOW_CREATE_FORMS.has(formName)) {
      // 新規顧客を作成（許可されたフォームのみ）
      isNew = true;
      const customerInsert: Record<string, unknown> = {
        name: name || "未入力",
        email,
        phone,
        application_date: new Date().toISOString(),
        data_origin: "webhook",
      };
      if (rawData["属性"]) customerInsert.attribute = normalizeAttribute(rawData["属性"]);

      const { data: newCustomer, error: createError } = await db
        .from("customers")
        .insert(customerInsert)
        .select("id")
        .single();

      if (createError || !newCustomer) {
        console.error("[webhook/google-forms] Customer creation failed:", createError);
        return NextResponse.json(
          { error: "Failed to create customer" },
          { status: 500 }
        );
      }

      customerId = newCustomer.id;

      // customer_emails に登録
      if (email) {
        await db.from("customer_emails").upsert(
          { customer_id: customerId, email, is_primary: true },
          { onConflict: "email" }
        );
      }

      // sales_pipeline を作成
      await db.from("sales_pipeline").insert({
        customer_id: customerId,
        stage: "日程未確",
      });
    } else {
      // 許可されていないフォームでマッチしなかった場合 → unmatched_recordsに保存
      console.warn(`[webhook/google-forms] No match for "${formName}" (name: ${name}). Saving to unmatched_records.`);
      await db.from("unmatched_records").insert({
        source: formName,
        raw_data: rawData,
        raw_data_hash: rawHash,
        status: "pending",
        notes: `${formName}: 顧客マッチなし（新規作成対象外フォーム）`,
      });

      return NextResponse.json({
        success: true,
        action: "unmatched",
        reason: `formName "${formName}" is not allowed to create new customers`,
      });
    }

    // application_history に INSERT（DBトリガーがraw_data_hashを自動計算）
    const { data: historyRecord, error: historyErr } = await db.from("application_history").insert({
      customer_id: customerId,
      source: formName,
      raw_data: rawData,
      raw_data_hash: rawHash,
      notes: `${formName}からWebhook同期`,
    }).select("id").single();

    if (historyErr && historyErr.code === "23505") {
      // ユニーク制約違反 = 重複データ → スキップ
      console.log(`[webhook/google-forms] Duplicate entry skipped for ${formName} (customer: ${customerId})`);
      return NextResponse.json({
        success: true,
        action: "skipped",
        reason: "duplicate (unique constraint)",
        customer_id: customerId,
      });
    }

    // processFormRecord() で関連テーブル更新・Slack通知・ProgressSheet・帰属チャネル計算
    if (historyRecord) {
      await processFormRecord(historyRecord.id);
    }

    return NextResponse.json({
      success: true,
      action: isNew ? "created" : "updated",
      customer_id: customerId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[webhook/google-forms]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
