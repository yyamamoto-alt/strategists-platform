import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";
import { notifyEnrollmentFormReceived, notifySubsidyEnrollment, notifyKarteSubmission, notifyYouTubeReferral, notifyMentoringEvaluation } from "@/lib/slack";
import { createProgressSheet, calculateAge } from "@/lib/google-sheets";
import crypto from "crypto";

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

/** 日付文字列を正規化 "2026/03/06" → "2026-03-06" */
function normalizeDateStr(d: string): string {
  return d.replace(/\//g, "-").trim();
}

/** 関連テーブルにupsert（レコードがなければinsert） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertRelated(db: any, table: string, customerId: string, data: Record<string, unknown>): Promise<void> {
  if (Object.keys(data).length === 0) return;
  data.updated_at = new Date().toISOString();

  // まずupdateを試み、影響行がなければinsert
  const { data: updated } = await db
    .from(table)
    .update(data)
    .eq("customer_id", customerId)
    .select("customer_id");

  if (!updated || updated.length === 0) {
    await db.from(table).insert({ customer_id: customerId, ...data });
  }
}

/**
 * フォームデータを関連テーブル（customers / sales_pipeline / contracts / learning_records / agent_records）に書き込む
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncFormFieldsToRelatedTables(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  customerId: string,
  sourceName: string,
  rawData: Record<string, string>,
  isNewRecord = false,
): Promise<void> {

  // --- カルテ → customers テーブル ---
  if (sourceName === "カルテ") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const custUpdate: Record<string, any> = {};
    if (rawData["お名前"]) custUpdate.name = rawData["お名前"];
    if (rawData["フリガナ"]) custUpdate.name_kana = rawData["フリガナ"].replace(/\s+/g, "");
    if (rawData["属性"]) custUpdate.attribute = rawData["属性"];
    if (rawData["志望企業"]) custUpdate.target_companies = rawData["志望企業"];
    if (rawData["転職意向"]) custUpdate.transfer_intent = rawData["転職意向"];
    if (rawData["ケース面接対策の状況"]) custUpdate.initial_level = rawData["ケース面接対策の状況"];
    if (rawData["弊塾を最初に知った場所"]) custUpdate.utm_source = rawData["弊塾を最初に知った場所"];
    if (rawData["居住地（都道府県）"]) custUpdate.prefecture = rawData["居住地（都道府県）"];
    if (rawData["生年月日"]) custUpdate.birth_date = normalizeDateStr(rawData["生年月日"]);
    if (rawData["性別"]) custUpdate.gender = rawData["性別"];
    if (rawData["面接予定時期"]) custUpdate.target_firm_type = rawData["面接予定時期"];
    if (rawData["利用中のエージェント"]) custUpdate.current_agent = rawData["利用中のエージェント"];
    if (rawData["転職先への入社希望日"]) custUpdate.desired_start_date = normalizeDateStr(rawData["転職先への入社希望日"]);

    // 経歴詳細 → career_history（既に値がない場合のみ上書き）
    if (rawData["経歴詳細（学歴＋職歴）"]) {
      const { data: existing } = await db.from("customers").select("career_history").eq("id", customerId).single();
      if (!existing?.career_history) {
        custUpdate.career_history = rawData["経歴詳細（学歴＋職歴）"];
      }
    }

    // 学歴から大学名を抽出（未設定の場合）
    if (rawData["経歴詳細（学歴＋職歴）"]) {
      const { data: existing } = await db.from("customers").select("university").eq("id", customerId).single();
      if (!existing?.university) {
        const uniMatch = rawData["経歴詳細（学歴＋職歴）"].match(/(?:大学院?|大学校)[^\n]*/);
        if (uniMatch) {
          // "東京理科大学大学院　理工学研究科" → "東京理科大学大学院"
          const uniName = rawData["経歴詳細（学歴＋職歴）"].match(/([^\s　]+大学(?:院|校)?)/);
          if (uniName) custUpdate.university = uniName[1];
        }
      }
    }

    if (Object.keys(custUpdate).length > 0) {
      custUpdate.updated_at = new Date().toISOString();
      await db.from("customers").update(custUpdate).eq("id", customerId);
    }

    // --- カルテ同期時: プログレスシート作成 + Slack通知 + YouTube通知 ---
    // ★ 初回レコードのみ実行（再処理時はスキップ — スパム防止）
    if (isNewRecord) {
      // カルテ送信ごとに新規ProgressSheet作成
      let progressSheetUrl: string | null = null;

      if (rawData["お名前"] && rawData["メールアドレス"]) {
        const result = await createProgressSheet({
          name: rawData["お名前"],
          email: rawData["メールアドレス"],
          nameKana: rawData["フリガナ"],
          attribute: rawData["属性"],
          birthDate: rawData["生年月日"],
          careerHistory: rawData["経歴詳細（学歴＋職歴）"],
          caseStatus: rawData["ケース面接対策の状況"],
          targetCompanies: rawData["志望企業"],
          transferIntent: rawData["転職意向"],
          university: custUpdate.university || undefined,
          prefecture: rawData["居住地（都道府県）"],
          gender: rawData["性別"],
          utmSource: rawData["弊塾を最初に知った場所"],
          enrollmentReason: rawData["弊塾を選んだ決め手"],
          interviewTiming: rawData["面接予定時期"],
          desiredStartDate: rawData["転職先への入社希望日"],
          currentAgent: rawData["利用中のエージェント"],
          planName: rawData["申込プラン"],
          agentUsage: rawData["エージェント利用"],
        });

        if (result) {
          progressSheetUrl = result.url;
          // contracts テーブルに progress_sheet_url を書き込み
          await upsertRelated(db, "contracts", customerId, {
            progress_sheet_url: result.url,
          });
        }
      }

      // Slack通知: #biz-dev（名前/年齢/経歴/志望/プログレスシートURL）
      const birthDate = rawData["生年月日"];
      const age = birthDate ? calculateAge(birthDate) : null;

      notifyKarteSubmission({
        name: rawData["お名前"] || "不明",
        attribute: rawData["属性"],
        age,
        xAccount: rawData["Xアカウント"],
        careerHistory: rawData["経歴詳細（学歴＋職歴）"],
        targetCompanies: rawData["志望企業"],
        caseStatus: rawData["ケース面接対策の状況"],
        interviewLevel: rawData["ケース面接のレベル"],
        transferIntent: rawData["転職意向"],
        desiredStartDate: rawData["転職先への入社希望日"],
        utmSource: rawData["弊塾を最初に知った場所"],
        progressSheetUrl: progressSheetUrl || undefined,
        customerId,
      }).catch(() => {}); // エラーで同期を止めない

      // YouTube経由の場合、#youtubeにも通知
      const utmSource = rawData["弊塾を最初に知った場所"] || "";
      const enrollmentReason = rawData["弊塾を選んだ決め手"] || "";
      if (utmSource.toLowerCase().includes("youtube") || enrollmentReason.toLowerCase().includes("youtube")) {
        notifyYouTubeReferral({
          name: rawData["お名前"] || "不明",
          attribute: rawData["属性"],
          careerHistory: rawData["経歴詳細（学歴＋職歴）"],
          prefecture: rawData["居住地（都道府県）"],
          customerId,
        }).catch(() => {});
      }
    } // end isNewRecord guard
  }

  // --- 営業報告 → sales_pipeline ---
  if (sourceName === "営業報告") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipelineUpdate: Record<string, any> = {};
    if (rawData["営業担当者名"]) pipelineUpdate.sales_person = rawData["営業担当者名"];
    if (rawData["入会確度"]) {
      const prob = parseInt(rawData["入会確度"].replace(/[^0-9]/g, ""), 10);
      if (!isNaN(prob)) pipelineUpdate.probability = prob / 100; // 100% → 1.0
    }
    if (rawData["購入希望/検討しているプラン"]) pipelineUpdate.additional_plan = rawData["購入希望/検討しているプラン"];
    if (rawData["ヒアリングメモ"]) pipelineUpdate.additional_notes = rawData["ヒアリングメモ"];
    if (rawData["結果"]) pipelineUpdate.meeting_result = rawData["結果"];
    if (rawData["フィードバック内容(簡単にでok)"]) pipelineUpdate.sales_content = rawData["フィードバック内容(簡単にでok)"];
    if (rawData["ネックになりそうな要素（複数選択可）"]) pipelineUpdate.marketing_memo = rawData["ネックになりそうな要素（複数選択可）"];
    if (rawData["実施日"]) pipelineUpdate.sales_date = normalizeDateStr(rawData["実施日"]);
    // 「次回実施日 or 検討結果連絡日」を結果に応じて振り分け
    if (rawData["次回実施日 or 検討結果連絡日"]) {
      const nextDate = normalizeDateStr(rawData["次回実施日 or 検討結果連絡日"]);
      const result = rawData["結果"] || "";
      if (result.includes("追加指導") || result === "枠確保") {
        pipelineUpdate.additional_coaching_date = nextDate;
      } else {
        pipelineUpdate.response_deadline = nextDate;
      }
    }
    if (rawData["営業内容・手応え"]) pipelineUpdate.sales_content = rawData["営業内容・手応え"];
    if (rawData["比較サービス"]) pipelineUpdate.comparison_services = rawData["比較サービス"];

    // 「結果」フィールドの値をstageに反映
    if (rawData["結果"]) {
      pipelineUpdate.stage = rawData["結果"];
    }

    if (Object.keys(pipelineUpdate).length > 0) {
      await upsertRelated(db, "sales_pipeline", customerId, pipelineUpdate);
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
    if (rawData["指導日"]) learningUpdate.last_coaching_date = normalizeDateStr(rawData["指導日"]);

    if (Object.keys(learningUpdate).length > 0) {
      await upsertRelated(db, "learning_records", customerId, learningUpdate);
    }
  }

  // --- 入塾フォーム → sales_pipeline (stage) + contracts + learning_records ---
  if (sourceName === "入塾フォーム") {
    // パイプラインstageを「成約」に進める
    await upsertRelated(db, "sales_pipeline", customerId, { stage: "成約" });

    // contracts テーブルにプラン情報を書き込み
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contractUpdate: Record<string, any> = {};
    if (rawData["申込プラン"]) {
      contractUpdate.plan_name = rawData["申込プラン"];
      // 補助金適用プラン判定
      if (rawData["申込プラン"].includes("補助金")) {
        contractUpdate.subsidy_eligible = true;
      }
    }
    if (rawData["エージェント利用"]) {
      const agentVal = rawData["エージェント利用"];
      if (agentVal.includes("フル")) contractUpdate.referral_category = "フル利用";
      else if (agentVal.includes("一部")) contractUpdate.referral_category = "一部利用";
    }

    if (Object.keys(contractUpdate).length > 0) {
      await upsertRelated(db, "contracts", customerId, contractUpdate);
    }

    // learning_records
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const learningUpdate: Record<string, any> = {};
    if (rawData["申込プラン"]) learningUpdate.progress_text = rawData["申込プラン"];
    if (rawData["Strategistsへの入会理由、（他社と比較した方）Strategistsを選んだ理由"]) {
      learningUpdate.enrollment_reason = rawData["Strategistsへの入会理由、（他社と比較した方）Strategistsを選んだ理由"];
    }
    if (rawData["（任意）指導にあたっての要望、重点的にFBして欲しい点や、成長したいと考えているポイントなど"]) {
      learningUpdate.coaching_requests = rawData["（任意）指導にあたっての要望、重点的にFBして欲しい点や、成長したいと考えているポイントなど"];
    }
    // 希望年収・現在の年収
    if (rawData["希望年収"]) {
      const salary = parseInt(rawData["希望年収"], 10);
      if (!isNaN(salary)) learningUpdate.desired_salary = salary;
    }

    if (Object.keys(learningUpdate).length > 0) {
      await upsertRelated(db, "learning_records", customerId, learningUpdate);
    }

    // Slack通知: プラン・エージェント利用の確認リクエスト（#sales_営業管理 + 担当者メンション）
    const { data: custPipeline } = await db.from("sales_pipeline").select("sales_person").eq("customer_id", customerId).single();
    const { data: custData } = await db.from("customers").select("name").eq("id", customerId).single();
    notifyEnrollmentFormReceived({
      customerName: custData?.name || rawData["お名前"] || "不明",
      customerId,
      planName: rawData["申込プラン"] || null,
      agentUsage: rawData["エージェント利用"] || null,
      subsidyEligible: rawData["申込プラン"]?.includes("補助金") ?? false,
      salesPerson: custPipeline?.sales_person || null,
    }).catch(() => {}); // エラーで同期を止めない

    // 補助金適用顧客の場合、荒井さんへSlack通知（書類確認TODO）
    if (rawData["申込プラン"]?.includes("補助金")) {
      const identityDoc = rawData["本人確認書類の写し"] || null;
      const bankDoc = rawData["振込先口座を確認できる書類の写し"] || null;
      notifySubsidyEnrollment({
        customerName: custData?.name || rawData["お名前"] || "不明",
        customerId,
        hasIdentityDoc: !!identityDoc,
        hasBankDoc: !!bankDoc,
        identityDocUrl: identityDoc,
        bankDocUrl: bankDoc,
      }).catch(() => {}); // エラーで同期を止めない
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
      await upsertRelated(db, "learning_records", customerId, learningUpdate);
    }
  }

  // --- エージェント面談報告 → agent_records ---
  if (sourceName === "エージェント面談報告フォーム") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentUpdate: Record<string, any> = {};
    if (rawData["担当CA"]) agentUpdate.agent_staff = rawData["担当CA"];
    if (rawData["現時点での転職(入社)予定日"]) {
      const dateStr = normalizeDateStr(rawData["現時点での転職(入社)予定日"]);
      try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) agentUpdate.placement_date = parsed.toISOString();
      } catch {
        // skip
      }
    }

    if (Object.keys(agentUpdate).length > 0) {
      await upsertRelated(db, "agent_records", customerId, agentUpdate);
    }
  }

  // --- 課題提出 → learning_records (満足度) + Slack通知 ---
  if (sourceName === "課題提出") {
    if (rawData["前回メンタリングの満足度"]) {
      await upsertRelated(db, "learning_records", customerId, {
        mentoring_satisfaction: rawData["前回メンタリングの満足度"],
      });

      // Slack通知: #指導管理（Zapier「メンター評価レポート」移管）— 初回のみ
      if (isNewRecord) {
        const { data: custData } = await db.from("customers").select("name").eq("id", customerId).single();
        notifyMentoringEvaluation({
          mentorName: rawData["担当メンター"] || rawData["メンター名"] || "不明",
          studentName: custData?.name || rawData["お名前"] || "不明",
          rating: rawData["前回メンタリングの満足度"],
          operationsNote: rawData["運営への連絡・依頼事項"] || rawData["運営への要望・連絡事項"] || "",
        }).catch(() => {});
      }
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
    // raw_data_hash（MD5）で高速に重複判定 + DBユニーク制約で二重防御
    const rawText = stableStringify(rawData);
    const rawDataHash = await md5Hash(rawText);
    const { data: existingByHash } = await db
      .from("application_history")
      .select("id")
      .eq("customer_id", match.customer_id)
      .eq("source", sourceName)
      .eq("raw_data_hash", rawDataHash)
      .limit(1);
    const isDuplicate = existingByHash && existingByHash.length > 0;

    // ソース別: 関連テーブルにフィールドを書き込み（isNewRecord: 重複でなければ初回）
    await syncFormFieldsToRelatedTables(db, match.customer_id, sourceName, rawData, !isDuplicate);

    if (!isDuplicate) {
      const { error: insertErr } = await db.from("application_history").insert({
        customer_id: match.customer_id,
        source: sourceName,
        raw_data: rawData,
        raw_data_hash: await md5Hash(rawText),
        notes: `${sourceName}から同期 (${match.match_type}マッチ)`,
      });
      // DB UNIQUE制約違反は握りつぶす（二重防御）
      if (insertErr && insertErr.code === "23505") {
        // duplicate → skip silently
      } else if (insertErr) {
        console.error("application_history insert error:", insertErr);
      }
    }

    // 帰属チャネルをリアルタイム計算（エラーは無視）
    computeAttributionForCustomer(match.customer_id).catch(() => {});

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
    await db.from("application_history").insert({
      customer_id: newCustomer.id,
      source: sourceName,
      raw_data: rawData,
      raw_data_hash: await md5Hash(stableStringify(rawData)),
      notes: `${sourceName}から自動作成`,
    });

    // 帰属チャネルをリアルタイム計算（エラーは無視）
    computeAttributionForCustomer(newCustomer.id).catch(() => {});

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
