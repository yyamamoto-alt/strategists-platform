import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { notifyEnrollmentFormReceived } from "@/lib/slack";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * フォームデータ → 関連テーブル一括バックフィル
 *
 * カルテ → customers, 営業報告 → sales_pipeline, 入塾フォーム → contracts+pipeline+learning
 * メンター指導報告 → learning_records, 指導終了報告 → learning_records
 *
 * cronで毎日1回実行、または手動でGETリクエスト。
 * 各フォームの最新レコードのみ処理（同一customer×sourceで最新applied_at）。
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const stats = { カルテ: 0, 営業報告: 0, 入塾フォーム: 0, メンター指導報告: 0, 指導終了報告: 0, errors: 0 };

  // ================================================================
  // カルテ → customers
  // ================================================================
  try {
    const { data: karteRecords } = await db
      .from("application_history")
      .select("customer_id, raw_data")
      .eq("source", "カルテ")
      .order("applied_at", { ascending: false });

    // customer_idごとに最新のみ
    const karteByCustomer = new Map<string, Record<string, string>>();
    for (const r of (karteRecords || [])) {
      if (!karteByCustomer.has(r.customer_id)) {
        karteByCustomer.set(r.customer_id, r.raw_data || {});
      }
    }

    for (const entry of Array.from(karteByCustomer.entries()) as [string, Record<string, string>][]) {
      const customerId = entry[0];
      const rd = entry[1];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd: Record<string, any> = {};
        if (rd["お名前"]) upd.name = rd["お名前"];
        if (rd["フリガナ"]) upd.name_kana = rd["フリガナ"].replace(/\s+/g, "");
        if (rd["属性"]) upd.attribute = rd["属性"];
        if (rd["志望企業"]) upd.target_companies = rd["志望企業"];
        if (rd["転職意向"]) upd.transfer_intent = rd["転職意向"];
        if (rd["ケース面接対策の状況"]) upd.initial_level = rd["ケース面接対策の状況"];
        if (rd["弊塾を最初に知った場所"]) upd.utm_source = rd["弊塾を最初に知った場所"];
        if (rd["居住地（都道府県）"]) upd.prefecture = rd["居住地（都道府県）"];
        if (rd["生年月日"]) upd.birth_date = normalizeDateStr(rd["生年月日"]);
        if (rd["面接予定時期"]) upd.target_firm_type = rd["面接予定時期"];
        if (rd["利用中のエージェント"]) upd.current_agent = rd["利用中のエージェント"];
        if (rd["転職先への入社希望日"]) upd.desired_start_date = normalizeDateStr(rd["転職先への入社希望日"]);
        if (rd["経歴詳細（学歴＋職歴）"]) {
          const { data: existing } = await db.from("customers").select("career_history, university").eq("id", customerId).single();
          if (!existing?.career_history) upd.career_history = rd["経歴詳細（学歴＋職歴）"];
          if (!existing?.university) {
            const uniName = rd["経歴詳細（学歴＋職歴）"].match(/([^\s　]+大学(?:院|校)?)/);
            if (uniName) upd.university = uniName[1];
          }
        }

        if (Object.keys(upd).length > 0) {
          upd.updated_at = new Date().toISOString();
          await db.from("customers").update(upd).eq("id", customerId);
          stats.カルテ++;
        }
      } catch { stats.errors++; }
    }
  } catch { stats.errors++; }

  // ================================================================
  // 営業報告 → sales_pipeline（最新のレコードで上書き）
  // ================================================================
  try {
    const { data: salesRecords } = await db
      .from("application_history")
      .select("customer_id, raw_data")
      .eq("source", "営業報告")
      .order("applied_at", { ascending: false });

    const salesByCustomer = new Map<string, Record<string, string>>();
    for (const r of (salesRecords || [])) {
      if (!salesByCustomer.has(r.customer_id)) {
        salesByCustomer.set(r.customer_id, r.raw_data || {});
      }
    }

    for (const [customerId, rd] of Array.from(salesByCustomer.entries()) as [string, Record<string, string>][]) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd: Record<string, any> = {};
        if (rd["営業担当者名"]) upd.sales_person = rd["営業担当者名"];
        if (rd["入会確度"]) {
          const prob = parseInt(rd["入会確度"].replace(/[^0-9]/g, ""), 10);
          if (!isNaN(prob)) upd.probability = prob / 100;
        }
        if (rd["購入希望/検討しているプラン"]) upd.additional_plan = rd["購入希望/検討しているプラン"];
        if (rd["ヒアリングメモ"]) upd.additional_notes = rd["ヒアリングメモ"];
        if (rd["結果"]) { upd.meeting_result = rd["結果"]; upd.stage = rd["結果"]; }
        if (rd["フィードバック内容(簡単にでok)"]) upd.sales_content = rd["フィードバック内容(簡単にでok)"];
        if (rd["ネックになりそうな要素（複数選択可）"]) upd.marketing_memo = rd["ネックになりそうな要素（複数選択可）"];
        if (rd["実施日"]) upd.sales_date = normalizeDateStr(rd["実施日"]);
        // 結果に応じて追加指導日 or 返答期限に振り分け
        if (rd["次回実施日 or 検討結果連絡日"]) {
          const nextDate = normalizeDateStr(rd["次回実施日 or 検討結果連絡日"]);
          const result = rd["結果"] || "";
          if (result.includes("追加指導") || result === "枠確保") {
            upd.meeting_scheduled_date = nextDate;
          } else {
            upd.response_deadline = nextDate;
          }
        }
        if (rd["営業内容・手応え"]) upd.sales_content = rd["営業内容・手応え"];
        if (rd["比較サービス"]) upd.comparison_services = rd["比較サービス"];

        if (Object.keys(upd).length > 0) {
          await upsertRelated(db, "sales_pipeline", customerId, upd);
          stats.営業報告++;
        }
      } catch { stats.errors++; }
    }
  } catch { stats.errors++; }

  // ================================================================
  // 入塾フォーム → sales_pipeline + contracts + learning_records
  // ================================================================
  try {
    const { data: enrollRecords } = await db
      .from("application_history")
      .select("customer_id, raw_data")
      .eq("source", "入塾フォーム")
      .order("applied_at", { ascending: false });

    const enrollByCustomer = new Map<string, Record<string, string>>();
    for (const r of (enrollRecords || [])) {
      if (!enrollByCustomer.has(r.customer_id)) {
        enrollByCustomer.set(r.customer_id, r.raw_data || {});
      }
    }

    for (const [customerId, rd] of Array.from(enrollByCustomer.entries()) as [string, Record<string, string>][]) {
      try {
        // pipeline → 成約
        await upsertRelated(db, "sales_pipeline", customerId, { stage: "成約" });

        // ⚠️ プランとエージェント利用はお客様入力なので自動書き込みしない
        // Slack通知で営業チームに確認を仰ぐ
        const planFromForm = rd["申込プラン"] || null;
        const agentFromForm = rd["エージェント利用"] || null;
        const subsidyEligible = planFromForm ? planFromForm.includes("補助金") : false;

        // 補助金フラグだけは自動設定（プラン名には書かない）
        if (subsidyEligible) {
          await upsertRelated(db, "contracts", customerId, { subsidy_eligible: true });
        }

        // learning_records（希望年収のみ自動反映）
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lrUpd: Record<string, any> = {};
        if (rd["希望年収"]) {
          const salary = parseInt(rd["希望年収"], 10);
          if (!isNaN(salary)) lrUpd.desired_salary = salary;
        }
        if (Object.keys(lrUpd).length > 0) {
          await upsertRelated(db, "learning_records", customerId, lrUpd);
        }

        // 営業担当者を取得（メンション用）
        let salesPerson: string | null = null;
        try {
          const { data: pipeline } = await db
            .from("sales_pipeline")
            .select("sales_person")
            .eq("customer_id", customerId)
            .single();
          salesPerson = pipeline?.sales_person || null;
        } catch { /* ignore */ }

        // 顧客名を取得
        let customerName = "不明";
        try {
          const { data: cust } = await db
            .from("customers")
            .select("name")
            .eq("id", customerId)
            .single();
          customerName = cust?.name || "不明";
        } catch { /* ignore */ }

        // Slack通知: プランとエージェント利用の確認リクエスト
        await notifyEnrollmentFormReceived({
          customerName,
          customerId,
          planName: planFromForm,
          agentUsage: agentFromForm,
          subsidyEligible,
          salesPerson,
        });

        stats.入塾フォーム++;
      } catch { stats.errors++; }
    }
  } catch { stats.errors++; }

  // ================================================================
  // メンター指導報告 → learning_records（最新のみ）
  // ================================================================
  try {
    const { data: mentorRecords } = await db
      .from("application_history")
      .select("customer_id, raw_data")
      .eq("source", "メンター指導報告")
      .order("applied_at", { ascending: false });

    const mentorByCustomer = new Map<string, Record<string, string>>();
    for (const r of (mentorRecords || [])) {
      if (!mentorByCustomer.has(r.customer_id)) {
        mentorByCustomer.set(r.customer_id, r.raw_data || {});
      }
    }

    for (const [customerId, rd] of Array.from(mentorByCustomer.entries()) as [string, Record<string, string>][]) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd: Record<string, any> = {};
        if (rd["メンター名"]) upd.mentor_name = rd["メンター名"];
        if (rd["回次（合計指導回数）"]) {
          const sessions = parseInt(rd["回次（合計指導回数）"], 10);
          if (!isNaN(sessions)) upd.completed_sessions = sessions;
        }
        if (rd["指導日"]) upd.last_coaching_date = normalizeDateStr(rd["指導日"]);

        if (Object.keys(upd).length > 0) {
          await upsertRelated(db, "learning_records", customerId, upd);
          stats.メンター指導報告++;
        }
      } catch { stats.errors++; }
    }
  } catch { stats.errors++; }

  // ================================================================
  // 指導終了報告 → learning_records
  // ================================================================
  try {
    const { data: endRecords } = await db
      .from("application_history")
      .select("customer_id, raw_data")
      .eq("source", "指導終了報告")
      .order("applied_at", { ascending: false });

    const endByCustomer = new Map<string, Record<string, string>>();
    for (const r of (endRecords || [])) {
      if (!endByCustomer.has(r.customer_id)) {
        endByCustomer.set(r.customer_id, r.raw_data || {});
      }
    }

    for (const [customerId, rd] of Array.from(endByCustomer.entries()) as [string, Record<string, string>][]) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd: Record<string, any> = {};
        if (rd["担当メンター名"]) upd.mentor_name = rd["担当メンター名"];
        if (rd["指導期間を通じたレベルアップ幅"]) upd.level_up_range = rd["指導期間を通じたレベルアップ幅"];
        if (rd["追加指導のご提案"]) upd.additional_coaching_proposal = rd["追加指導のご提案"];
        if (rd["戦コンへの内定確度"]) upd.offer_probability_at_end = rd["戦コンへの内定確度"];
        if (rd["受験予定企業"]) upd.target_companies_at_end = rd["受験予定企業"];

        if (Object.keys(upd).length > 0) {
          await upsertRelated(db, "learning_records", customerId, upd);
          stats.指導終了報告++;
        }
      } catch { stats.errors++; }
    }
  } catch { stats.errors++; }

  return NextResponse.json({ success: true, stats });
}

// ================================================================
// ヘルパー
// ================================================================

function normalizeDateStr(dateStr: string): string {
  return dateStr.replace(/\//g, "-");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertRelated(db: any, table: string, customerId: string, data: Record<string, unknown>) {
  const { count } = await db
    .from(table)
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("customer_id", customerId);

  if (count === 0) {
    await db.from(table).insert({
      customer_id: customerId,
      ...data,
    });
  }
}
