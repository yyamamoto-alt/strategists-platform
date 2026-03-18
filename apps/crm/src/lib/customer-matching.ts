import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { processFormRecord } from "@/lib/process-form-record";
import crypto from "crypto";

/** 属性の表記揺れを正規化（「中途」→「既卒」） */
export function normalizeAttribute(attr: string): string {
  if (attr === "中途") return "既卒";
  return attr;
}

/** MD5ハッシュ（DB側のmd5()と同等） */
async function md5Hash(text: string): Promise<string> {
  return crypto.createHash("md5").update(text).digest("hex");
}

/** JSONB key order-independent hash for dedup comparison */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return JSON.stringify(obj.map(stableStringify));
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return JSON.stringify(
    Object.fromEntries(sorted.map((k) => [k, (obj as Record<string, unknown>)[k]]))
  );
}

export interface MatchResult {
  customer_id: string;
  match_type: "email" | "phone" | "name_kana" | "fuzzy";
}

// ================================================================
// 名前正規化ヘルパー
// ================================================================

/** スペース・全角スペース除去 + 小文字化 */
function normalizeName(name: string): string {
  return name.replace(/[\s\u3000]/g, "").toLowerCase();
}

/** ひらがな → カタカナ変換 */
function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

/** 名前の類似判定（表記ゆれ対応） */
function namesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;

  // カタカナ統一比較
  const ka = hiraganaToKatakana(na);
  const kb = hiraganaToKatakana(nb);
  if (ka === kb) return true;

  // 姓名入れ替え（2文字以上の場合、半分で分割して逆順比較）
  // "山本雄大" vs "雄大山本" → 各2文字ずつ
  if (na.length >= 2 && nb.length >= 2) {
    // 片方に含まれるもう片方の文字を全て含むか（順不同）
    const charsA = na.split("").sort().join("");
    const charsB = nb.split("").sort().join("");
    if (charsA === charsB) return true;
  }

  return false;
}

/** 電話番号正規化 */
function normalizePhone(phone: string): string {
  return phone.replace(/[-\s\u3000()（）+]/g, "");
}

/** 電話番号の類似判定（下8桁一致） */
function phonesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (na === nb) return true;
  // 下8桁一致（国番号違いなど対応）
  if (na.length >= 8 && nb.length >= 8) {
    return na.slice(-8) === nb.slice(-8);
  }
  return false;
}

// ================================================================
// メインマッチング関数
// ================================================================

/**
 * メールアドレス → 電話番号 → カナ名 → ファジー（直近60分）の順で顧客を照合
 */
export async function matchCustomer(
  email?: string | null,
  phone?: string | null,
  nameKana?: string | null,
  name?: string | null,
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

    // customers.email でもチェック
    const { data: custByEmail } = await db
      .from("customers")
      .select("id")
      .eq("email", normalizedEmail)
      .limit(1)
      .single();

    if (custByEmail) {
      return { customer_id: custByEmail.id, match_type: "email" };
    }
  }

  // Step 2: customers.phone で電話番号照合
  if (phone) {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length >= 10) {
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
  }

  // Step 3: name_kana（カタカナ名）照合
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

  // Step 4: ファジーマッチ — 直近60分以内に作成された顧客に対して
  // 2つ以上の項目が一致する場合のみマッチとする（誤マッチ防止）
  if (email || phone || name) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: recentCustomers } = await db
      .from("customers")
      .select("id, name, email, phone")
      .gte("created_at", oneHourAgo)
      .limit(100);

    if (recentCustomers && recentCustomers.length > 0) {
      for (const cust of recentCustomers as { id: string; name: string | null; email: string | null; phone: string | null }[]) {
        let score = 0;

        // メールのローカルパート一致
        if (email && cust.email) {
          const localA = email.trim().toLowerCase().split("@")[0];
          const localB = cust.email.trim().toLowerCase().split("@")[0];
          if (localA && localB && localA === localB) score++;
        }

        // 電話番号ファジー一致
        if (phonesMatch(phone || null, cust.phone)) score++;

        // 名前ファジー一致
        if (namesMatch(name || null, cust.name)) score++;

        // 2つ以上一致で確定
        if (score >= 2) {
          return { customer_id: cust.id, match_type: "fuzzy" };
        }
      }
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
  action: "created" | "updated" | "unmatched" | "skipped";
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

  const match = await matchCustomer(email, phone, null, name);

  if (match) {
    // マッチ → 既存レコード更新
    const updateData: Record<string, string> = {};
    const customerFields = ["name", "phone", "university", "faculty", "career_history", "attribute", "utm_source", "utm_medium", "utm_campaign", "utm_id"];
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

    // application_history に履歴追加（重複チェック付き）
    const rawText = stableStringify(rawData);
    const rawDataHash = await md5Hash(rawText);

    const { data: historyRecord, error: insertErr } = await db.from("application_history").insert({
      customer_id: match.customer_id,
      source: sourceName,
      raw_data: rawData,
      raw_data_hash: rawDataHash,
      notes: `${sourceName}から同期 (${match.match_type}マッチ)`,
    }).select("id").single();

    if (insertErr && insertErr.code === "23505") {
      // ユニーク制約違反 = 重複 → スキップ
    } else if (insertErr) {
      console.error("application_history insert error:", insertErr);
    }

    // processFormRecord() で関連テーブル更新・通知・帰属チャネル計算
    if (historyRecord) {
      await processFormRecord(historyRecord.id);
    }

    return { action: "updated", customer_id: match.customer_id, match_type: match.match_type };
  }

  // 未マッチ: LP申込などautoCreate=trueなら新規顧客を自動作成
  if (autoCreateCustomer && (email || name)) {
    // 日付パース（「2026年3月1日」→ ISO形式）
    let appDate = new Date().toISOString();
    if (fields.application_date) {
      const jpMatch = fields.application_date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (jpMatch) {
        appDate = new Date(
          parseInt(jpMatch[1]),
          parseInt(jpMatch[2]) - 1,
          parseInt(jpMatch[3])
        ).toISOString();
      } else {
        try {
          const parsed = new Date(fields.application_date);
          if (!isNaN(parsed.getTime())) appDate = parsed.toISOString();
        } catch {
          // fallback to now
        }
      }
    }

    const customerInsert: Record<string, unknown> = {
      name: name || "未入力",
      email: email ? email.trim().toLowerCase() : null,
      phone: phone || null,
      application_date: appDate,
      data_origin: "auto_sync",
    };
    if (fields.attribute) customerInsert.attribute = normalizeAttribute(fields.attribute);
    if (fields.university) customerInsert.university = fields.university;
    if (fields.utm_source) customerInsert.utm_source = fields.utm_source;
    if (fields.utm_medium) customerInsert.utm_medium = fields.utm_medium;
    if (fields.utm_campaign) customerInsert.utm_campaign = fields.utm_campaign;
    if (fields.utm_id) customerInsert.utm_id = fields.utm_id;

    const { data: newCustomer, error: createError } = await db
      .from("customers")
      .insert(customerInsert)
      .select()
      .single();

    if (createError || !newCustomer) {
      // 作成失敗 → 未マッチキューに入れる（UNIQUE制約で重複防止）
      const unmatchedHash = await md5Hash(stableStringify(rawData));
      const { error: unmatchedErr } = await db.from("unmatched_records").insert({
        sync_log_id: syncLogId,
        connection_id: connectionId,
        raw_data: rawData,
        raw_data_hash: unmatchedHash,
        email, phone, name,
      });
      if (unmatchedErr && unmatchedErr.code !== "23505") {
        console.error("unmatched_records insert error:", unmatchedErr);
      }
      return { action: unmatchedErr?.code === "23505" ? "skipped" : "unmatched" };
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
      stage: "日程未確",
    });

    // application_history に履歴追加（新規作成なので重複なし）
    const { data: newHistory } = await db.from("application_history").insert({
      customer_id: newCustomer.id,
      source: sourceName,
      raw_data: rawData,
      raw_data_hash: await md5Hash(stableStringify(rawData)),
      notes: `${sourceName}から自動作成`,
    }).select("id").single();

    // processFormRecord() で関連テーブル更新・通知・帰属チャネル計算
    if (newHistory) {
      await processFormRecord(newHistory.id);
    }

    return { action: "created", customer_id: newCustomer.id };
  }

  // 未マッチ → unmatched_records に追加（raw_data_hashで重複防止）
  const unmatchedHash = await md5Hash(stableStringify(rawData));
  const { error: unmatchedErr } = await db.from("unmatched_records").insert({
    sync_log_id: syncLogId,
    connection_id: connectionId,
    raw_data: rawData,
    raw_data_hash: unmatchedHash,
    email, phone, name,
  });
  // UNIQUE制約違反（既に同じraw_dataが登録済み）は無視
  if (unmatchedErr && unmatchedErr.code !== "23505") {
    console.error("unmatched_records insert error:", unmatchedErr);
  }

  return { action: unmatchedErr?.code === "23505" ? "skipped" : "unmatched" };
}
