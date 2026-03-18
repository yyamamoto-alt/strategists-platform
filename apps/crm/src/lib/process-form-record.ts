import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { normalizeAttribute } from "@/lib/customer-matching";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";
import {
  notifyKarteSubmission,
  notifyYouTubeReferral,
  notifyEnrollmentFormReceived,
  notifySubsidyEnrollment,
  notifyMentoringEvaluation,
} from "@/lib/slack";
import { createProgressSheet, calculateAge } from "@/lib/google-sheets";

// ================================================================
// ユーティリティ
// ================================================================

/** 日付文字列を正規化 "2026/03/06" → "2026-03-06" */
function normalizeDateStr(d: string): string {
  return d.replace(/\//g, "-").trim();
}

/**
 * 関連テーブルにupsert（ON CONFLICT使用 — レースコンディション耐性）
 * 既存の update→count→insert パターンは競合に弱いため、DB本来のupsertを使用
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertRelated(db: any, table: string, customerId: string, data: Record<string, unknown>): Promise<void> {
  if (Object.keys(data).length === 0) return;
  data.updated_at = new Date().toISOString();

  const { error } = await db
    .from(table)
    .upsert(
      { customer_id: customerId, ...data },
      { onConflict: "customer_id" }
    );

  if (error) {
    console.error(`[processFormRecord] upsert ${table} error:`, error);
  }
}

// ================================================================
// メインエントリポイント
// ================================================================

export interface ProcessFormRecordOptions {
  /** backfillから呼ぶ場合はtrue — Slack通知を送らない */
  skipNotification?: boolean;
}

export interface ProcessFormRecordResult {
  success: boolean;
  action?: string;
  error?: string;
}

/**
 * application_historyのレコードIDを受け取り、sourceに応じて関連テーブルを更新する。
 *
 * 全てのデータ流入経路（Webhook, Spreadsheet Sync, Cron Backfill）が
 * この1つの関数を通してデータを処理する。
 *
 * 責務:
 * 1. application_historyからraw_data/source/customer_idを取得
 * 2. sourceに応じたフィールドマッピングで関連テーブルを更新
 * 3. Slack通知（skipNotificationでなければ）
 * 4. ProgressSheet作成（カルテ＋シート未作成時のみ）
 * 5. 帰属チャネル計算
 */
export async function processFormRecord(
  historyId: string,
  options: ProcessFormRecordOptions = {},
): Promise<ProcessFormRecordResult> {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // 1. application_history からレコード取得
  const { data: history, error: fetchErr } = await db
    .from("application_history")
    .select("id, customer_id, source, raw_data")
    .eq("id", historyId)
    .single();

  if (fetchErr || !history) {
    return { success: false, error: `application_history not found: ${historyId}` };
  }

  const { customer_id: customerId, source: sourceName, raw_data: rawData } = history as {
    customer_id: string;
    source: string;
    raw_data: Record<string, string>;
  };

  const sendNotification = !options.skipNotification;

  try {
    // 2. sourceに応じて関連テーブルを更新
    switch (sourceName) {
      case "カルテ":
        await processKarte(db, customerId, rawData, sendNotification);
        break;
      case "営業報告":
        await processSalesReport(db, customerId, rawData);
        break;
      case "メンター指導報告":
        await processMentorReport(db, customerId, rawData);
        break;
      case "入塾フォーム":
        await processEnrollmentForm(db, customerId, rawData, sendNotification);
        break;
      case "指導終了報告":
        await processCoachingEndReport(db, customerId, rawData);
        break;
      case "エージェント面談報告フォーム":
        await processAgentReport(db, customerId, rawData);
        break;
      case "課題提出":
        await processAssignmentSubmission(db, customerId, rawData, sendNotification);
        break;
      default:
        // 未知のソース — 関連テーブル更新なし（application_historyに記録されるだけ）
        break;
    }

    // 5. 帰属チャネル計算（全ソース共通）
    computeAttributionForCustomer(customerId).catch(() => {});

    return { success: true, action: "processed" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[processFormRecord] Error processing ${sourceName} for customer ${customerId}:`, e);
    return { success: false, error: msg };
  }
}

// ================================================================
// ソース別処理関数
// ================================================================

/**
 * カルテ → customers + sales_pipeline.initial_channel + ProgressSheet + Slack通知
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processKarte(db: any, customerId: string, rawData: Record<string, string>, sendNotification: boolean): Promise<void> {
  // --- customers テーブル更新 ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const custUpdate: Record<string, any> = {};
  if (rawData["お名前"]) custUpdate.name = rawData["お名前"];
  if (rawData["フリガナ"]) custUpdate.name_kana = rawData["フリガナ"].replace(/\s+/g, "");
  if (rawData["属性"]) custUpdate.attribute = normalizeAttribute(rawData["属性"]);
  if (rawData["志望企業"]) custUpdate.target_companies = rawData["志望企業"];
  if (rawData["転職意向"]) custUpdate.transfer_intent = rawData["転職意向"];
  if (rawData["ケース面接対策の状況"]) custUpdate.initial_level = rawData["ケース面接対策の状況"];
  // ※ utm_source は LP経由のUTMパラメータ専用。カルテの日本語値は入れない
  if (rawData["弊塾への面談申し込みのきっかけ、決め手 "] || rawData["弊塾への面談申し込みのきっかけ、決め手"]) {
    custUpdate.application_reason_karte = rawData["弊塾への面談申し込みのきっかけ、決め手 "] || rawData["弊塾への面談申し込みのきっかけ、決め手"];
  }
  if (rawData["居住地（都道府県）"]) custUpdate.prefecture = rawData["居住地（都道府県）"];
  if (rawData["生年月日"]) custUpdate.birth_date = normalizeDateStr(rawData["生年月日"]);
  if (rawData["性別"]) custUpdate.gender = rawData["性別"];
  if (rawData["面接予定時期"]) custUpdate.target_firm_type = rawData["面接予定時期"];
  if (rawData["利用中のエージェント"]) custUpdate.current_agent = rawData["利用中のエージェント"];
  if (rawData["転職先への入社希望日"]) custUpdate.desired_start_date = normalizeDateStr(rawData["転職先への入社希望日"]);

  // 経歴詳細 → career_history（既に値がない場合のみ）
  if (rawData["経歴詳細（学歴＋職歴）"]) {
    const { data: existing } = await db.from("customers").select("career_history, university").eq("id", customerId).single();
    if (!existing?.career_history) {
      custUpdate.career_history = rawData["経歴詳細（学歴＋職歴）"];
    }
    // 学歴から大学名を抽出（未設定の場合）
    if (!existing?.university) {
      const uniMatch = rawData["経歴詳細（学歴＋職歴）"].match(/(?:大学院?|大学校)[^\n]*/);
      if (uniMatch) {
        const uniName = rawData["経歴詳細（学歴＋職歴）"].match(/([^\s　]+大学(?:院|校)?)/);
        if (uniName) custUpdate.university = uniName[1];
      }
    }
  }

  if (Object.keys(custUpdate).length > 0) {
    custUpdate.updated_at = new Date().toISOString();
    await db.from("customers").update(custUpdate).eq("id", customerId);
  }

  // --- sales_pipeline.initial_channel 同期 ---
  if (rawData["弊塾を最初に知った場所"]) {
    await db.from("sales_pipeline")
      .update({ initial_channel: rawData["弊塾を最初に知った場所"], updated_at: new Date().toISOString() })
      .eq("customer_id", customerId);
  }

  // --- ProgressSheet作成 ---
  if (rawData["お名前"] && rawData["メールアドレス"]) {
    const { data: existingContract } = await db
      .from("contracts")
      .select("progress_sheet_url")
      .eq("customer_id", customerId)
      .not("progress_sheet_url", "is", null)
      .limit(1);

    const hasSheet = existingContract && existingContract.length > 0;

    if (!hasSheet) {
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
        // contracts テーブルに保存（upsert）
        const { data: updated } = await db
          .from("contracts")
          .update({ progress_sheet_url: result.url, updated_at: new Date().toISOString() })
          .eq("customer_id", customerId)
          .select("customer_id");
        if (!updated || updated.length === 0) {
          await db.from("contracts").insert({
            customer_id: customerId,
            progress_sheet_url: result.url,
          });
        }
      }
    }
  }

  // --- Slack通知 ---
  if (sendNotification) {
    const birthDate = rawData["生年月日"];
    const age = birthDate ? calculateAge(birthDate) : null;

    const { data: existingContract } = await db
      .from("contracts")
      .select("progress_sheet_url")
      .eq("customer_id", customerId)
      .not("progress_sheet_url", "is", null)
      .limit(1);

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
      progressSheetUrl: existingContract?.[0]?.progress_sheet_url || undefined,
      customerId,
    }).catch((e) => console.error("[processFormRecord] Slack karte notification failed:", e));

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
      }).catch((e) => console.error("[processFormRecord] Slack notification failed:", e));
    }
  }
}

/**
 * 営業報告 → sales_pipeline
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processSalesReport(db: any, customerId: string, rawData: Record<string, string>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipelineUpdate: Record<string, any> = {};
  if (rawData["営業担当者名"]) pipelineUpdate.sales_person = rawData["営業担当者名"];
  if (rawData["入会確度"]) {
    const prob = parseInt(rawData["入会確度"].replace(/[^0-9]/g, ""), 10);
    if (!isNaN(prob)) pipelineUpdate.probability = prob / 100;
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

/**
 * メンター指導報告 → learning_records
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processMentorReport(db: any, customerId: string, rawData: Record<string, string>): Promise<void> {
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

/**
 * 入塾フォーム → sales_pipeline(stage) + contracts + learning_records + Slack通知
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processEnrollmentForm(db: any, customerId: string, rawData: Record<string, string>, sendNotification: boolean): Promise<void> {
  // パイプラインstageを「成約」に進める
  await upsertRelated(db, "sales_pipeline", customerId, { stage: "成約" });

  // contracts テーブルにプラン情報を書き込み
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractUpdate: Record<string, any> = {};
  if (rawData["申込プラン"]) {
    contractUpdate.plan_name = rawData["申込プラン"];
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
  if (rawData["希望年収"]) {
    const salary = parseInt(rawData["希望年収"], 10);
    if (!isNaN(salary)) learningUpdate.desired_salary = salary;
  }

  if (Object.keys(learningUpdate).length > 0) {
    await upsertRelated(db, "learning_records", customerId, learningUpdate);
  }

  // Slack通知
  if (sendNotification) {
    const { data: custPipeline } = await db.from("sales_pipeline").select("sales_person").eq("customer_id", customerId).single();
    const { data: custData } = await db.from("customers").select("name").eq("id", customerId).single();
    notifyEnrollmentFormReceived({
      customerName: custData?.name || rawData["お名前"] || "不明",
      customerId,
      planName: rawData["申込プラン"] || null,
      agentUsage: rawData["エージェント利用"] || null,
      subsidyEligible: rawData["申込プラン"]?.includes("補助金") ?? false,
      salesPerson: custPipeline?.sales_person || null,
    }).catch((e) => console.error("[processFormRecord] Slack notification failed:", e));

    // 補助金適用顧客の場合、荒井さんへSlack通知
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
      }).catch((e) => console.error("[processFormRecord] Slack notification failed:", e));
    }
  }
}

/**
 * 指導終了報告 → learning_records
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processCoachingEndReport(db: any, customerId: string, rawData: Record<string, string>): Promise<void> {
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

/**
 * エージェント面談報告 → agent_records
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processAgentReport(db: any, customerId: string, rawData: Record<string, string>): Promise<void> {
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

/**
 * 課題提出 → learning_records(満足度) + Slack通知
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processAssignmentSubmission(db: any, customerId: string, rawData: Record<string, string>, sendNotification: boolean): Promise<void> {
  if (rawData["前回メンタリングの満足度"]) {
    await upsertRelated(db, "learning_records", customerId, {
      mentoring_satisfaction: rawData["前回メンタリングの満足度"],
    });

    // Slack通知: #指導管理
    if (sendNotification) {
      const { data: custData } = await db.from("customers").select("name").eq("id", customerId).single();
      notifyMentoringEvaluation({
        mentorName: rawData["担当メンター"] || rawData["メンター名"] || "不明",
        studentName: custData?.name || rawData["お名前"] || "不明",
        rating: rawData["前回メンタリングの満足度"],
        operationsNote: rawData["運営への連絡・依頼事項"] || rawData["運営への要望・連絡事項"] || "",
      }).catch((e) => console.error("[processFormRecord] Slack notification failed:", e));
    }
  }
}
