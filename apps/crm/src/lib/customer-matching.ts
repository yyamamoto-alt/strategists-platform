import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export interface MatchResult {
  customer_id: string;
  match_type: "email" | "phone" | "name_kana";
}

/**
 * メールアドレス → 電話番号 の順で顧客を照合
 */
export async function matchCustomer(
  email?: string | null,
  phone?: string | null,
  nameKana?: string | null,
): Promise<MatchResult | null> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Step 1: customer_emails テーブルでメール照合
  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const { data } = await db
      .from("customer_emails")
      .select("customer_id")
      .eq("email", normalizedEmail)
      .limit(1)
      .single();

    if (data) {
      return { customer_id: data.customer_id, match_type: "email" };
    }
  }

  // Step 2: customers.phone で電話番号照合
  if (phone) {
    const normalizedPhone = phone.replace(/[-\s\u3000()（）]/g, "");
    const { data } = await db
      .from("customers")
      .select("id")
      .eq("phone", normalizedPhone)
      .limit(1)
      .single();

    if (data) {
      return { customer_id: data.id, match_type: "phone" };
    }
  }

  // Step 3: name_kana（カタカナ名）照合 — Freee銀行振込のカタカナ名マッチ用
  if (nameKana) {
    const normalizedKana = nameKana.trim().replace(/\s+/g, "");
    const { data } = await db
      .from("customers")
      .select("id")
      .eq("name_kana", normalizedKana)
      .limit(1)
      .single();

    if (data) {
      return { customer_id: data.id, match_type: "name_kana" };
    }
  }

  // マッチなし
  return null;
}

/**
 * カラムマッピングに基づいてスプレッドシート行からCRMフィールドを抽出
 */
export function extractFieldsFromRow(
  row: string[],
  headers: string[],
  columnMapping: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [crmField, sheetColumn] of Object.entries(columnMapping)) {
    const colIndex = headers.indexOf(sheetColumn);
    if (colIndex >= 0 && colIndex < row.length && row[colIndex]) {
      result[crmField] = row[colIndex].trim();
    }
  }

  return result;
}

export interface UpsertResult {
  action: "created" | "updated" | "unmatched";
  customer_id?: string;
  match_type?: string;
}

/**
 * スプレッドシート1行分を処理:
 * マッチ → 更新
 * 未マッチ + autoCreate → 新規顧客作成
 * 未マッチ + !autoCreate → キュー追加
 */
export async function upsertFromSpreadsheet(
  connectionId: string,
  syncLogId: string,
  fields: Record<string, string>,
  rawData: Record<string, string>,
  sourceName: string,
  autoCreateCustomer?: boolean
): Promise<UpsertResult> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const email = fields.email || null;
  const phone = fields.phone || null;
  const name = fields.name || null;

  const match = await matchCustomer(email, phone);

  if (match) {
    // マッチ → 既存レコード更新
    const updateData: Record<string, string> = {};
    const customerFields = ["name", "phone", "university", "faculty", "career_history", "attribute"];
    for (const f of customerFields) {
      if (fields[f] && f !== "email") {
        updateData[f] = fields[f];
      }
    }
    updateData.updated_at = new Date().toISOString();

    if (Object.keys(updateData).length > 1) {
      await db
        .from("customers")
        .update(updateData)
        .eq("id", match.customer_id);
    }

    // メールアドレスを customer_emails に追加（新規メールの場合）
    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      await db
        .from("customer_emails")
        .upsert(
          { customer_id: match.customer_id, email: normalizedEmail, is_primary: false },
          { onConflict: "email" }
        );
    }

    // application_history に履歴追加
    await db.from("application_history").insert({
      customer_id: match.customer_id,
      source: sourceName,
      raw_data: rawData,
      notes: `${sourceName}から同期 (${match.match_type}マッチ)`,
    });

    return { action: "updated", customer_id: match.customer_id, match_type: match.match_type };
  }

  // 未マッチ: LP申込などautoCreate=trueなら新規顧客を自動作成
  if (autoCreateCustomer && (email || name)) {
    const customerInsert: Record<string, unknown> = {
      name: name || "未入力",
      email: email ? email.trim().toLowerCase() : null,
      phone: phone || null,
      application_date: fields.application_date || new Date().toISOString(),
    };
    if (fields.attribute) customerInsert.attribute = fields.attribute;
    if (fields.university) customerInsert.university = fields.university;

    const { data: newCustomer, error: createError } = await db
      .from("customers")
      .insert(customerInsert)
      .select()
      .single();

    if (createError || !newCustomer) {
      // 作成失敗 → 未マッチキューに入れる
      await db.from("unmatched_records").insert({
        sync_log_id: syncLogId,
        connection_id: connectionId,
        raw_data: rawData,
        email, phone, name,
      });
      return { action: "unmatched" };
    }

    // customer_emails に登録
    if (email) {
      await db.from("customer_emails").upsert(
        { customer_id: newCustomer.id, email: email.trim().toLowerCase(), is_primary: true },
        { onConflict: "email" }
      );
    }

    // sales_pipeline を作成
    await db.from("sales_pipeline").insert({
      customer_id: newCustomer.id,
      stage: "問い合わせ",
      deal_status: "未対応",
    });

    // application_history に履歴追加
    await db.from("application_history").insert({
      customer_id: newCustomer.id,
      source: sourceName,
      raw_data: rawData,
      notes: `${sourceName}から自動作成`,
    });

    return { action: "created", customer_id: newCustomer.id };
  }

  // 未マッチ → unmatched_records に追加
  await db.from("unmatched_records").insert({
    sync_log_id: syncLogId,
    connection_id: connectionId,
    raw_data: rawData,
    email, phone, name,
  });

  return { action: "unmatched" };
}
