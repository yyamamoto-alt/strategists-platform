import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

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
 * フォームデータを関連テーブル（sales_pipeline / learning_records）に書き込む
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncFormFieldsToRelatedTables(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  customerId: string,
  sourceName: string,
  rawData: Record<string, string>,
): Promise<void> {
  // --- 営業報告 → sales_pipeline ---
  if (sourceName === "営業報告") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipelineUpdate: Record<string, any> = {};
    if (rawData["営業担当者名"]) pipelineUpdate.sales_person = rawData["営業担当者名"];
    if (rawData["入会確度"]) {
      const prob = parseInt(rawData["入会確度"].replace(/[^0-9]/g, ""), 10);
      if (!isNaN(prob)) pipelineUpdate.probability = prob;
    }
    if (rawData["購入希望/検討しているプラン"]) pipelineUpdate.additional_plan = rawData["購入希望/検討しているプラン"];
    if (rawData["ヒアリングメモ"]) pipelineUpdate.additional_notes = rawData["ヒアリングメモ"];
    if (rawData["結果"]) pipelineUpdate.meeting_result = rawData["結果"];
    if (rawData["フィードバック内容(簡単にでok)"]) pipelineUpdate.sales_content = rawData["フィードバック内容(簡単にでok)"];
    if (rawData["ネックになりそうな要素（複数選択可）"]) pipelineUpdate.marketing_memo = rawData["ネックになりそうな要素（複数選択可）"];
    if (rawData["実施日"]) pipelineUpdate.sales_date = rawData["実施日"];

    // 「結果」フィールドの値をstageに反映
    if (rawData["結果"]) {
      pipelineUpdate.stage = rawData["結果"];
    }

    if (Object.keys(pipelineUpdate).length > 0) {
      pipelineUpdate.updated_at = new Date().toISOString();
      await db
        .from("sales_pipeline")
        .update(pipelineUpdate)
        .eq("customer_id", customerId);
    }
  }

  // --- メンター指導報告 → learning_records ---
  if (sourceName === "メンター指導報告") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const learningUpdate: Record<string, any> = {};
    if (rawData["メンター名"]) learningUpdate.mentor_name = rawData["メンター名"];
    if (rawData["回次（合計指導回数）"]) {
      const sessions = parseInt(rawData["回次（合計指導回数）"], 10);
      if (!isNaN(sessions)) learningUpdate.completed_sessions = sessions;
    }
    if (rawData["指導日"]) learningUpdate.last_coaching_date = rawData["指導日"];

    if (Object.keys(learningUpdate).length > 0) {
      learningUpdate.updated_at = new Date().toISOString();
      await db
        .from("learning_records")
        .update(learningUpdate)
        .eq("customer_id", customerId);
    }
  }

  // --- 入塾フォーム → sales_pipeline (stage更新) + learning_records ---
  if (sourceName === "入塾フォーム") {
    // 入塾 → パイプラインstageを「成約」に進める
    await db
      .from("sales_pipeline")
      .update({
        stage: "成約",
        deal_status: "成約",
        updated_at: new Date().toISOString(),
      })
      .eq("customer_id", customerId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const learningUpdate: Record<string, any> = {};
    if (rawData["申込プラン"]) learningUpdate.progress_text = rawData["申込プラン"];
    if (rawData["エージェント利用"]) learningUpdate.selection_status = rawData["エージェント利用"];
    if (rawData["Strategistsへの入会理由、（他社と比較した方）Strategistsを選んだ理由"]) {
      learningUpdate.enrollment_reason = rawData["Strategistsへの入会理由、（他社と比較した方）Strategistsを選んだ理由"];
    }
    if (rawData["（任意）指導にあたっての要望、重点的にFBして欲しい点や、成長したいと考えているポイントなど"]) {
      learningUpdate.coaching_requests = rawData["（任意）指導にあたっての要望、重点的にFBして欲しい点や、成長したいと考えているポイントなど"];
    }

    if (Object.keys(learningUpdate).length > 0) {
      learningUpdate.updated_at = new Date().toISOString();
      await db
        .from("learning_records")
        .update(learningUpdate)
        .eq("customer_id", customerId);
    }
  }

  // --- 指導終了報告 → learning_records ---
  if (sourceName === "指導終了報告") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const learningUpdate: Record<string, any> = {};
    if (rawData["担当メンター名"]) learningUpdate.mentor_name = rawData["担当メンター名"];
    if (rawData["指導期間を通じたレベルアップ幅"]) learningUpdate.level_up_range = rawData["指導期間を通じたレベルアップ幅"];
    if (rawData["追加指導のご提案"]) learningUpdate.additional_coaching_proposal = rawData["追加指導のご提案"];
    if (rawData["戦コンへの内定確度"]) learningUpdate.offer_probability_at_end = rawData["戦コンへの内定確度"];
    if (rawData["受験予定企業"]) learningUpdate.target_companies_at_end = rawData["受験予定企業"];
    if (rawData["【既卒のみ】面接予定時期"]) learningUpdate.interview_timing_at_end = rawData["【既卒のみ】面接予定時期"];

    if (Object.keys(learningUpdate).length > 0) {
      learningUpdate.updated_at = new Date().toISOString();
      await db
        .from("learning_records")
        .update(learningUpdate)
        .eq("customer_id", customerId);
    }
  }

  // --- エージェント面談報告 → agent_records ---
  if (sourceName === "エージェント面談報告フォーム") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentUpdate: Record<string, any> = {};
    if (rawData["担当CA"]) agentUpdate.agent_staff = rawData["担当CA"];
    if (rawData["現時点での転職(入社)予定日"]) {
      // 日付パース: "2026/04/01" 形式
      try {
        const parsed = new Date(rawData["現時点での転職(入社)予定日"]);
        if (!isNaN(parsed.getTime())) agentUpdate.placement_date = parsed.toISOString();
      } catch {
        // skip
      }
    }

    if (Object.keys(agentUpdate).length > 0) {
      agentUpdate.updated_at = new Date().toISOString();
      await db
        .from("agent_records")
        .update(agentUpdate)
        .eq("customer_id", customerId);
    }
  }

  // --- 課題提出 → learning_records (満足度) ---
  if (sourceName === "課題提出") {
    if (rawData["前回メンタリングの満足度"]) {
      await db
        .from("learning_records")
        .update({
          mentoring_satisfaction: rawData["前回メンタリングの満足度"],
          updated_at: new Date().toISOString(),
        })
        .eq("customer_id", customerId);
    }
  }
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

    // ソース別: 関連テーブルにフィールドを書き込み
    await syncFormFieldsToRelatedTables(db, match.customer_id, sourceName, rawData);

    // application_history に履歴追加（重複チェック付き）
    const rawText = JSON.stringify(rawData);
    const { data: existingHistory } = await db
      .from("application_history")
      .select("id")
      .eq("customer_id", match.customer_id)
      .eq("source", sourceName)
      .limit(1);

    // 同じraw_dataが既にあればスキップ
    let isDuplicate = false;
    if (existingHistory && existingHistory.length > 0) {
      const { data: allHistory } = await db
        .from("application_history")
        .select("id, raw_data")
        .eq("customer_id", match.customer_id)
        .eq("source", sourceName);
      isDuplicate = allHistory?.some(
        (h: { id: string; raw_data: Record<string, unknown> }) =>
          JSON.stringify(h.raw_data) === rawText
      ) ?? false;
    }

    if (!isDuplicate) {
      await db.from("application_history").insert({
        customer_id: match.customer_id,
        source: sourceName,
        raw_data: rawData,
        notes: `${sourceName}から同期 (${match.match_type}マッチ)`,
      });
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
    if (fields.attribute) customerInsert.attribute = fields.attribute;
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
      stage: "日程未確",
      deal_status: "進行中",
    });

    // application_history に履歴追加（新規作成なので重複なし）
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
