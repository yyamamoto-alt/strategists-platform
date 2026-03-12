import { createServiceClient } from "@/lib/supabase/server";
import { matchCustomer } from "@/lib/customer-matching";
import { computeAttributionForCustomer } from "@/lib/compute-attribution-for-customer";
import {
  notifyKarteSubmission,
  notifyYouTubeReferral,
} from "@/lib/slack";
import { createProgressSheet, calculateAge } from "@/lib/google-sheets";
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
 * Zapier「カルテ記入→顧客登録→ProgressSheet作成→Slack通知」の完全移植。
 * ポーリング（sync-spreadsheets）ではなく、フォーム送信時に即座に1回だけ実行。
 *
 * リクエストボディ:
 * {
 *   "secret": "WEBHOOK_SECRET",
 *   "formName": "カルテ",
 *   "data": { "お名前": "...", "メールアドレス": "...", ... }
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { secret, formName, data } = body;

    // 認証: CRON_SECRETを共用
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

    // 重複チェック（同じデータが二重送信された場合の防御）
    const rawHash = md5(stableStringify(rawData));
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

    // メールアドレスと名前を取得
    const email = (rawData["メールアドレス"] || "").trim().toLowerCase() || null;
    const name = rawData["お名前"] || null;
    const phone = rawData["電話番号"] || null;

    // 顧客マッチング
    const match = await matchCustomer(email, phone, null, name);
    let customerId: string;
    let isNew = false;

    if (match) {
      customerId = match.customer_id;

      // 既存顧客を更新
      const custUpdate: Record<string, string> = {};
      if (name) custUpdate.name = name;
      if (rawData["フリガナ"]) custUpdate.name_kana = rawData["フリガナ"].replace(/\s+/g, "");
      if (rawData["属性"]) custUpdate.attribute = rawData["属性"];
      if (rawData["志望企業"]) custUpdate.target_companies = rawData["志望企業"];
      if (rawData["転職意向"]) custUpdate.transfer_intent = rawData["転職意向"];
      if (rawData["ケース面接対策の状況"]) custUpdate.initial_level = rawData["ケース面接対策の状況"];
      if (rawData["弊塾を最初に知った場所"]) custUpdate.utm_source = rawData["弊塾を最初に知った場所"];
      if (rawData["居住地（都道府県）"]) custUpdate.prefecture = rawData["居住地（都道府県）"];
      if (rawData["生年月日"]) custUpdate.birth_date = rawData["生年月日"];
      if (rawData["性別"]) custUpdate.gender = rawData["性別"];
      if (rawData["利用中のエージェント"]) custUpdate.current_agent = rawData["利用中のエージェント"];
      custUpdate.updated_at = new Date().toISOString();

      if (Object.keys(custUpdate).length > 1) {
        await db.from("customers").update(custUpdate).eq("id", customerId);
      }

      // メールアドレスを customer_emails に追加
      if (email) {
        await db.from("customer_emails").upsert(
          { customer_id: customerId, email, is_primary: false },
          { onConflict: "email" }
        );
      }
    } else {
      // 新規顧客を作成
      isNew = true;
      const customerInsert: Record<string, unknown> = {
        name: name || "未入力",
        email,
        phone,
        application_date: new Date().toISOString(),
        data_origin: "webhook",
      };
      if (rawData["属性"]) customerInsert.attribute = rawData["属性"];
      if (rawData["弊塾を最初に知った場所"]) customerInsert.utm_source = rawData["弊塾を最初に知った場所"];

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
    }

    // application_history に履歴追加
    await db.from("application_history").insert({
      customer_id: customerId,
      source: formName,
      raw_data: rawData,
      raw_data_hash: rawHash,
      notes: `${formName}からWebhook同期`,
    });

    // 帰属チャネル計算
    computeAttributionForCustomer(customerId).catch(() => {});

    // === カルテ固有の処理 ===
    let progressSheetUrl: string | null = null;

    if (formName === "カルテ") {
      // 1. ProgressSheet作成（未作成の場合のみ）
      const { data: existingContracts } = await db
        .from("contracts")
        .select("progress_sheet_url")
        .eq("customer_id", customerId)
        .limit(1);

      progressSheetUrl = existingContracts?.[0]?.progress_sheet_url || null;

      if (!progressSheetUrl && rawData["お名前"] && rawData["メールアドレス"]) {
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
          progressSheetUrl = result.url;
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

      // 2. Slack通知（#biz-dev / #sales_新規申込）
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
      }).catch((e) => console.error("[webhook] Slack notification failed:", e));

      // 3. YouTube経由の場合、#youtubeにも通知
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
    }

    return NextResponse.json({
      success: true,
      action: isNew ? "created" : "updated",
      customer_id: customerId,
      progress_sheet_url: progressSheetUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[webhook/google-forms]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
