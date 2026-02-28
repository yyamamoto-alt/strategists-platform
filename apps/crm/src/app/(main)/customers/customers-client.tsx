"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  formatDate,
  formatCurrency,
  formatPercent,
  getStageColor,
  getAttributeColor,
  getDealStatusColor,
} from "@/lib/utils";
import type { CustomerWithRelations } from "@strategy-school/shared-db";
import {
  calcClosingProbability,
  calcExpectedLTV,
  calcSalesProjection,
  calcRemainingSessions,
  calcProgressStatus,
  calcAgentProjectedRevenue,
  calcExpectedReferralFee,
  calcSessionProgress,
  calcScheduleProgress,
  isAgentCustomer,
  isAgentConfirmed,
  getSubsidyAmount,
} from "@/lib/calc-fields";
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from "@/components/spreadsheet-table";

interface CustomersClientProps {
  customers: CustomerWithRelations[];
}

// テキスト truncate ヘルパー
function Truncated({ value, width = 140 }: { value: string | null | undefined; width?: number }) {
  return (
    <span className={`max-w-[${width}px] truncate block`} title={value || ""}>
      {value || "-"}
    </span>
  );
}

export function CustomersClient({ customers }: CustomersClientProps) {
  const [search, setSearch] = useState("");
  const [attributeFilter, setAttributeFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("application_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"design" | "spreadsheet">("spreadsheet");

  // 属性・ステージフィルタは両ビュー共通
  const baseFiltered = useMemo(() => {
    let result = [...customers];
    if (attributeFilter) {
      result = result.filter((c) => c.attribute === attributeFilter);
    }
    if (stageFilter) {
      result = result.filter((c) => c.pipeline?.stage === stageFilter);
    }
    return result;
  }, [customers, attributeFilter, stageFilter]);

  // デザインビュー用: テキスト検索 + ソート
  const filtered = useMemo(() => {
    let result = [...baseFiltered];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.university?.toLowerCase().includes(q) ||
          c.career_history?.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortBy) {
        case "application_date":
          aVal = a.application_date || "";
          bVal = b.application_date || "";
          break;
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "amount":
          aVal = a.contract?.confirmed_amount || 0;
          bVal = b.contract?.confirmed_amount || 0;
          break;
      }

      if (sortDir === "asc") return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

    return result;
  }, [baseFiltered, search, sortBy, sortDir]);

  // ==============================================================
  // スプレッドシートビュー用カラム定義
  // Excel顧客DB(new) Col 1～141 と完全一致の順序
  // ==============================================================
  const spreadsheetColumns: SpreadsheetColumn<CustomerWithRelations>[] = useMemo(
    () => [
      // ─── Col 2 (B): 名前 [sticky] ───
      { key: "name", label: "名前", width: 140, render: (c) => (
        <Link href={`/customers/${c.id}`} className="text-brand hover:underline">{c.name}</Link>
      ), sortValue: (c) => c.name },

      // ─── Col 1 (A): 申込日 ───
      { key: "application_date", label: "申込日", width: 100, render: (c) => formatDate(c.application_date), sortValue: (c) => c.application_date || "" },

      // ─── Col 3 (C): メアド ───
      { key: "email", label: "メアド", width: 180, render: (c) => c.email || "-" },

      // ─── Col 4 (D): 電話番号 ───
      { key: "phone", label: "電話番号", width: 130, render: (c) => c.phone || "-" },

      // ─── Col 5-8 (E-H): UTM ───
      { key: "utm_source", label: "utm_source", width: 100, render: (c) => c.utm_source || "-", sortValue: (c) => c.utm_source || "" },
      { key: "utm_medium", label: "utm_medium", width: 100, render: (c) => c.utm_medium || "-" },
      { key: "utm_id", label: "utm_id", width: 80, render: (c) => c.utm_id || "-" },
      { key: "utm_campaign", label: "utm_campaign", width: 120, render: (c) => c.utm_campaign || "-" },

      // ─── Col 9 (I): 属性 ───
      { key: "attribute", label: "属性", width: 70, render: (c) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(c.attribute)}`}>{c.attribute}</span>
      ), sortValue: (c) => c.attribute },

      // ─── Col 10 (J): 経歴 ───
      { key: "career_history", label: "経歴", width: 200, render: (c) => <Truncated value={c.career_history} width={200} /> },

      // ─── Col 11 (K): 申込時点エージェント ───
      { key: "agent_interest", label: "申込時エージェント", width: 130, render: (c) =>
        c.pipeline?.agent_interest_at_application ? "○" : "-" },

      // ─── Col 12 (L): 面接予定時期 ───
      { key: "meeting_scheduled", label: "面接予定時期", width: 110, render: (c) => formatDate(c.pipeline?.meeting_scheduled_date ?? null), sortValue: (c) => c.pipeline?.meeting_scheduled_date || "" },

      // ─── Col 13 (M): 検討状況 ───
      { key: "stage", label: "検討状況", width: 90, render: (c) => c.pipeline ? (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(c.pipeline.stage)}`}>{c.pipeline.stage}</span>
      ) : "-", sortValue: (c) => c.pipeline?.stage || "" },

      // ─── Col 14 (N): 売上見込 ───
      { key: "projected_amount", label: "売上見込", width: 110, align: "right" as const, render: (c) => {
        const v = calcSalesProjection(c);
        return v > 0 ? formatCurrency(v) : "-";
      }, sortValue: (c) => calcSalesProjection(c) },

      // ─── Col 15 (O): 検討・失注理由 ───
      { key: "decision_factor", label: "検討・失注理由", width: 140, render: (c) => <Truncated value={c.pipeline?.decision_factor} /> },

      // ─── Col 16 (P): 実施状況 ───
      { key: "deal_status", label: "実施状況", width: 90, render: (c) => c.pipeline ? (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDealStatusColor(c.pipeline.deal_status)}`}>{c.pipeline.deal_status}</span>
      ) : "-", sortValue: (c) => c.pipeline?.deal_status || "" },

      // ─── Col 17 (Q): 初回認知経路 ───
      { key: "initial_channel", label: "初回認知経路", width: 120, render: (c) => c.pipeline?.initial_channel || "-" },

      // ─── Col 18 (R): 申し込みの決め手 ───
      { key: "application_reason", label: "申し込みの決め手", width: 140, render: (c) => <Truncated value={c.application_reason} /> },

      // ─── Col 19 (S): 営業実施日 ───
      { key: "sales_date", label: "営業実施日", width: 100, render: (c) => formatDate(c.pipeline?.sales_date ?? null), sortValue: (c) => c.pipeline?.sales_date || "" },

      // ─── Col 20 (T): 確度 ───
      { key: "probability", label: "確度", width: 70, align: "right" as const, render: (c) =>
        c.pipeline?.probability != null ? formatPercent(c.pipeline.probability) : "-",
        sortValue: (c) => c.pipeline?.probability || 0 },

      // ─── Col 21 (U): 返答日/仮入会日 ───
      { key: "response_date", label: "返答日", width: 100, render: (c) => formatDate(c.pipeline?.response_date ?? null) },

      // ─── Col 22 (V): 営業担当 ───
      { key: "sales_person", label: "営業担当", width: 90, render: (c) => c.pipeline?.sales_person || "-" },

      // ─── Col 23 (W): 営業内容 ───
      { key: "sales_content", label: "営業内容", width: 180, render: (c) => <Truncated value={c.pipeline?.sales_content} width={180} /> },

      // ─── Col 24 (X): 営業方針 ───
      { key: "sales_strategy", label: "営業方針", width: 140, render: (c) => <Truncated value={c.pipeline?.sales_strategy} /> },

      // ─── Col 25 (Y): jicooメッセージ ───
      { key: "jicoo_message", label: "jicooメッセージ", width: 140, render: (c) => <Truncated value={c.pipeline?.jicoo_message} /> },

      // ─── Col 26 (Z): エージェント利用意向 ───
      { key: "agent_confirmation", label: "エージェント利用意向", width: 130, render: (c) => c.pipeline?.agent_confirmation || "-" },

      // ─── Col 27 (AA): マーケメモ ───
      { key: "marketing_memo", label: "マーケメモ", width: 140, render: (c) => <Truncated value={c.pipeline?.marketing_memo} /> },

      // ─── Col 28 (AB): 経路(営業担当記入) ───
      { key: "sales_route", label: "経路(営業)", width: 120, render: (c) => c.pipeline?.sales_route || c.pipeline?.route_by_sales || "-" },

      // ─── Col 29 (AC): 比較サービス ───
      { key: "comparison_services", label: "比較サービス", width: 140, render: (c) => <Truncated value={c.pipeline?.comparison_services} /> },

      // ─── Col 30 (AD): 一次報酬分類 ───
      { key: "first_reward_category", label: "一次報酬分類", width: 110, render: (c) => c.pipeline?.first_reward_category || "-" },

      // ─── Col 31 (AE): 成果報酬分類 ───
      { key: "performance_reward_category", label: "成果報酬分類", width: 110, render: (c) => c.pipeline?.performance_reward_category || "-" },

      // ─── Col 32 (AF): リードタイム ───
      { key: "lead_time", label: "リードタイム", width: 100, render: (c) => c.pipeline?.lead_time || "-" },

      // ─── Col 33 (AG): Google広告成果対象 ───
      { key: "google_ads_target", label: "Google広告", width: 110, render: (c) => c.pipeline?.google_ads_target || "-" },

      // ─── Col 34 (AH): 人材紹介区分 ───
      { key: "referral_category", label: "人材紹介区分", width: 110, render: (c) => c.contract?.referral_category || "-" },

      // ─── Col 35 (AI): 紹介ステータス ───
      { key: "referral_status", label: "紹介ステータス", width: 110, render: (c) => c.contract?.referral_status || "-" },

      // ─── Col 36 (AJ): 一次報酬請求予定額 ───
      { key: "first_amount", label: "一次報酬額", width: 110, align: "right" as const, render: (c) =>
        c.contract?.first_amount ? formatCurrency(c.contract.first_amount) : "-",
        sortValue: (c) => c.contract?.first_amount || 0 },

      // ─── Col 37 (AK): 確定売上 ───
      { key: "confirmed_amount", label: "確定売上", width: 110, align: "right" as const, render: (c) =>
        c.contract?.confirmed_amount ? formatCurrency(c.contract.confirmed_amount) : "-",
        sortValue: (c) => c.contract?.confirmed_amount || 0 },

      // ─── Col 38 (AL): 割引 ───
      { key: "discount", label: "割引", width: 80, align: "right" as const, render: (c) =>
        c.contract?.discount ? formatCurrency(c.contract.discount) : "-" },

      // ─── Col 39 (AM): Progress Sheet ───
      { key: "progress_sheet", label: "Progress Sheet", width: 120, render: (c) =>
        c.contract?.progress_sheet_url ? (
          <a href={c.contract.progress_sheet_url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline text-xs">リンク</a>
        ) : "-" },

      // ─── Col 40 (AN): 受講状況 ───
      { key: "enrollment_status", label: "受講状況", width: 100, render: (c) => c.contract?.enrollment_status || "-" },

      // ─── Col 41 (AO): 受講サービス名 ───
      { key: "plan_name", label: "受講サービス名", width: 160, render: (c) => <Truncated value={c.contract?.plan_name} width={160} /> },

      // ─── Col 42 (AP): 指導メンター ───
      { key: "mentor_name", label: "指導メンター", width: 100, render: (c) => c.learning?.mentor_name || "-" },

      // ─── Col 43 (AQ): 入金日 ───
      { key: "payment_date", label: "入金日", width: 100, render: (c) => formatDate(c.contract?.payment_date ?? null), sortValue: (c) => c.contract?.payment_date || "" },

      // ─── Col 44 (AR): 指導開始日 ───
      { key: "coaching_start", label: "指導開始日", width: 100, render: (c) => formatDate(c.learning?.coaching_start_date ?? null), sortValue: (c) => c.learning?.coaching_start_date || "" },

      // ─── Col 45 (AS): 指導終了日 ───
      { key: "coaching_end", label: "指導終了日", width: 100, render: (c) => formatDate(c.learning?.coaching_end_date ?? null), sortValue: (c) => c.learning?.coaching_end_date || "" },

      // ─── Col 46 (AT): 最終指導日 ───
      { key: "last_coaching", label: "最終指導日", width: 100, render: (c) => formatDate(c.learning?.last_coaching_date ?? null) },

      // ─── Col 47 (AU): 契約月数 ───
      { key: "contract_months", label: "契約月数", width: 80, align: "right" as const, render: (c) =>
        c.learning?.contract_months != null ? `${c.learning.contract_months}ヶ月` : "-" },

      // ─── Col 48 (AV): 契約指導回数 ───
      { key: "total_sessions", label: "契約指導回数", width: 100, align: "right" as const, render: (c) =>
        c.learning?.total_sessions != null ? `${c.learning.total_sessions}回` : "-",
        sortValue: (c) => c.learning?.total_sessions || 0 },

      // ─── Col 49 (AW): 週あたり指導数 ───
      { key: "weekly_sessions", label: "週あたり指導数", width: 110, align: "right" as const, render: (c) =>
        c.learning?.weekly_sessions != null ? `${c.learning.weekly_sessions}回` : "-" },

      // ─── Col 50 (AX): 指導完了数 ───
      { key: "completed_sessions", label: "指導完了数", width: 90, align: "right" as const, render: (c) =>
        c.learning?.completed_sessions != null ? `${c.learning.completed_sessions}回` : "-",
        sortValue: (c) => c.learning?.completed_sessions || 0 },

      // ─── 残指導回数（計算: total - completed） ───
      { key: "remaining_sessions", label: "残指導回数", width: 90, align: "right" as const, render: (c) => {
        const r = calcRemainingSessions(c);
        return c.learning ? `${r}回` : "-";
      }, sortValue: (c) => calcRemainingSessions(c) },

      // ─── Col 51 (AY): 日程消化率 ───
      { key: "attendance_rate", label: "日程消化率", width: 90, align: "right" as const, render: (c) => {
        const v = calcScheduleProgress(c);
        return v !== null ? formatPercent(v) : (c.learning?.attendance_rate != null ? formatPercent(c.learning.attendance_rate) : "-");
      } },

      // ─── Col 52 (AZ): 指導消化率 ───
      { key: "session_completion_rate", label: "指導消化率", width: 90, align: "right" as const, render: (c) => {
        const v = calcSessionProgress(c);
        return v !== null ? formatPercent(v) : "-";
      } },

      // ─── 進捗ステータス（計算） ───
      { key: "progress_status", label: "進捗", width: 60, align: "center" as const, render: (c) => {
        const s = calcProgressStatus(c);
        const color = s === "順調" ? "text-green-400" : s === "遅延" ? "text-red-400" : "text-gray-500";
        return <span className={color}>{s}</span>;
      } },

      // ─── Col 53 (BA): 進捗テキスト ───
      { key: "progress_text", label: "進捗テキスト", width: 140, render: (c) => <Truncated value={c.learning?.progress_text} /> },

      // ─── Col 54-56 (BB-BD): レベル ───
      { key: "level_fermi", label: "フェルミ", width: 70, render: (c) => c.learning?.level_fermi || "-" },
      { key: "level_case", label: "ケース", width: 70, render: (c) => c.learning?.level_case || "-" },
      { key: "level_mck", label: "McK", width: 70, render: (c) => c.learning?.level_mck || "-" },

      // ─── Col 58 (BF): 選考状況 ───
      { key: "selection_status", label: "選考状況", width: 120, render: (c) => <Truncated value={c.learning?.selection_status} width={120} /> },

      // ─── Col 59 (BG): レベルアップ幅 ───
      { key: "level_up_range", label: "レベルアップ幅", width: 110, render: (c) => c.learning?.level_up_range || "-" },

      // ─── Col 60 (BH): 面接予定時期(終了時) ───
      { key: "interview_timing_at_end", label: "面接予定時期(終了時)", width: 140, render: (c) => <Truncated value={c.learning?.interview_timing_at_end} /> },

      // ─── Col 61 (BI): 受験企業(終了時) ───
      { key: "target_companies_at_end", label: "受験企業(終了時)", width: 140, render: (c) => <Truncated value={c.learning?.target_companies_at_end} /> },

      // ─── Col 62 (BJ): 内定確度判定 ───
      { key: "offer_probability_at_end", label: "内定確度判定", width: 100, render: (c) => c.learning?.offer_probability_at_end || "-" },

      // ─── Col 63 (BK): 追加指導提案 ───
      { key: "additional_coaching_proposal", label: "追加指導提案", width: 140, render: (c) => <Truncated value={c.learning?.additional_coaching_proposal} /> },

      // ─── Col 64 (BL): 指導開始時レベル ───
      { key: "initial_coaching_level", label: "指導開始時レベル", width: 120, render: (c) => c.learning?.initial_coaching_level || "-" },

      // ─── Col 65 (BM): 入会フォーム提出日 ───
      { key: "enrollment_form_date", label: "入会フォーム日", width: 110, render: (c) => formatDate(c.learning?.enrollment_form_date ?? null) },

      // ─── Col 66 (BN): 指導要望 ───
      { key: "coaching_requests", label: "指導要望", width: 140, render: (c) => <Truncated value={c.learning?.coaching_requests} /> },

      // ─── Col 67 (BO): 入会理由 ───
      { key: "enrollment_reason", label: "入会理由", width: 140, render: (c) => <Truncated value={c.learning?.enrollment_reason} /> },

      // ─── Col 68 (BP): エージェント業務メモ ───
      { key: "agent_memo", label: "エージェント業務メモ", width: 160, render: (c) => <Truncated value={c.agent?.agent_memo} width={160} /> },

      // ─── Col 69-70 (BQ-BR): ビヘイビア ───
      { key: "behavior_session1", label: "ビヘイビア1回目", width: 120, render: (c) => <Truncated value={c.learning?.behavior_session1} width={120} /> },
      { key: "behavior_session2", label: "ビヘイビア2回目", width: 120, render: (c) => <Truncated value={c.learning?.behavior_session2} width={120} /> },

      // ─── Col 71-72 (BS-BT): アセスメント ───
      { key: "assessment_session1", label: "アセスメント1回目", width: 130, render: (c) => <Truncated value={c.learning?.assessment_session1} width={130} /> },
      { key: "assessment_session2", label: "アセスメント2回目", width: 130, render: (c) => <Truncated value={c.learning?.assessment_session2} width={130} /> },

      // ─── Col 73 (BU): 人材見込売上 ───
      { key: "agent_projected_revenue", label: "人材見込売上", width: 120, align: "right" as const, render: (c) => {
        // DB値 or 計算値
        const dbVal = c.agent?.expected_agent_revenue;
        const calcVal = calcAgentProjectedRevenue(c);
        const v = (dbVal && dbVal > 0) ? dbVal : calcVal;
        return v > 0 ? formatCurrency(v) : "-";
      }, sortValue: (c) => c.agent?.expected_agent_revenue || calcAgentProjectedRevenue(c) },

      // ─── Col 74 (BV): 延長分(日) ───
      { key: "extension_days", label: "延長分(日)", width: 90, align: "right" as const, render: (c) =>
        c.learning?.extension_days != null ? `${c.learning.extension_days}日` : "-" },

      // ─── Col 75 (BW): 内定先 ───
      { key: "offer_company", label: "内定先", width: 140, render: (c) => c.agent?.offer_company || "-" },

      // ─── Col 76 (BX): 利用エージェント ───
      { key: "external_agents", label: "利用エージェント", width: 120, render: (c) => c.agent?.external_agents || "-" },

      // ─── Col 77 (BY): 入社至る率 ───
      { key: "hire_rate", label: "入社至る率", width: 90, align: "right" as const, render: (c) =>
        c.agent?.hire_rate != null ? formatPercent(c.agent.hire_rate) : "-" },

      // ─── Col 78 (BZ): 内定確度 ───
      { key: "offer_probability", label: "内定確度", width: 90, align: "right" as const, render: (c) =>
        c.agent?.offer_probability != null ? formatPercent(c.agent.offer_probability) : "-" },

      // ─── Col 79 (CA): 想定年収 ───
      { key: "offer_salary", label: "想定年収", width: 110, align: "right" as const, render: (c) =>
        c.agent?.offer_salary ? formatCurrency(c.agent.offer_salary) : "-",
        sortValue: (c) => c.agent?.offer_salary || 0 },

      // ─── Col 80 (CB): 紹介料率 ───
      { key: "referral_fee_rate", label: "紹介料率", width: 80, align: "right" as const, render: (c) =>
        c.agent?.referral_fee_rate != null ? formatPercent(c.agent.referral_fee_rate) : "-" },

      // ─── Col 81 (CC): マージン ───
      { key: "margin", label: "マージン", width: 80, align: "right" as const, render: (c) =>
        c.agent?.margin != null ? `${c.agent.margin}` : "-" },

      // ─── Col 82 (CD): 入社予定日 ───
      { key: "placement_date", label: "入社予定日", width: 100, render: (c) => formatDate(c.agent?.placement_date ?? null) },

      // ─── Col 83 (CE): メモ ───
      { key: "general_memo", label: "メモ", width: 160, render: (c) => <Truncated value={c.agent?.general_memo} width={160} /> },

      // ─── Col 84-85 (CF-CG): カルテ情報 ───
      { key: "karte_email", label: "メアド(カルテ)", width: 160, render: (c) => c.karte_email || "-" },
      { key: "karte_phone", label: "電話(カルテ)", width: 120, render: (c) => c.karte_phone || "-" },

      // ─── Col 86 (CH): 生年月日 ───
      { key: "birth_date", label: "生年月日", width: 100, render: (c) => formatDate(c.birth_date ?? null) },

      // ─── Col 87 (CI): フリガナ ───
      { key: "name_kana", label: "フリガナ", width: 120, render: (c) => c.name_kana || "-" },

      // ─── Col 88 (CJ): 志望企業 ───
      { key: "target_companies", label: "志望企業", width: 160, render: (c) => <Truncated value={c.target_companies} width={160} /> },

      // ─── Col 89 (CK): 対策ファーム ───
      { key: "target_firm_type", label: "対策ファーム", width: 120, render: (c) => c.target_firm_type || "-" },

      // ─── Col 90 (CL): 申込時レベル ───
      { key: "initial_level", label: "申込時レベル", width: 100, render: (c) => c.initial_level || "-" },

      // ─── Col 91 (CM): ケース面接対策の進捗 ───
      { key: "case_interview_progress", label: "ケース面接対策進捗", width: 160, render: (c) => <Truncated value={c.learning?.case_interview_progress} width={160} /> },

      // ─── Col 92 (CN): ケース面接で苦手なこと ───
      { key: "case_interview_weaknesses", label: "ケース面接苦手", width: 140, render: (c) => <Truncated value={c.learning?.case_interview_weaknesses} /> },

      // ─── Col 93 (CO): 申込の決め手(カルテ) ───
      { key: "application_reason_karte", label: "申込の決め手(カルテ)", width: 160, render: (c) => <Truncated value={c.application_reason_karte} width={160} /> },

      // ─── Col 94 (CP): 有料プログラムへの関心 ───
      { key: "program_interest", label: "有料プログラム関心", width: 140, render: (c) => <Truncated value={c.program_interest} /> },

      // ─── Col 95 (CQ): 希望期間・頻度 ───
      { key: "desired_schedule", label: "希望期間・頻度", width: 120, render: (c) => <Truncated value={c.desired_schedule} width={120} /> },

      // ─── Col 96 (CR): ご購入いただいたコンテンツ ───
      { key: "purchased_content", label: "購入コンテンツ", width: 140, render: (c) => <Truncated value={c.purchased_content} /> },

      // ─── Col 97 (CS): 親御様からの支援 ───
      { key: "parent_support", label: "親御様支援", width: 100, render: (c) => c.parent_support || "-" },

      // ─── Col 98 (CT): 就活アカウント(X) ───
      { key: "sns_accounts", label: "就活アカウント", width: 120, render: (c) => c.sns_accounts || "-" },

      // ─── Col 99 (CU): 参考メディア ───
      { key: "reference_media", label: "参考メディア", width: 120, render: (c) => c.reference_media || "-" },

      // ─── Col 100 (CV): 趣味・特技 ───
      { key: "hobbies", label: "趣味・特技", width: 120, render: (c) => <Truncated value={c.hobbies} width={120} /> },

      // ─── Col 101 (CW): 行動特性 ───
      { key: "behavioral_traits", label: "行動特性", width: 140, render: (c) => <Truncated value={c.behavioral_traits} /> },

      // ─── Col 102 (CX): その他要望・特記事項 ───
      { key: "other_background", label: "その他", width: 140, render: (c) => <Truncated value={c.other_background} /> },

      // ─── Col 103 (CY): 備考 ───
      { key: "notes", label: "備考", width: 180, render: (c) => <Truncated value={c.notes} width={180} /> },

      // ─── Col 104 (CZ): 注意事項 ───
      { key: "caution_notes", label: "注意事項", width: 140, render: (c) => <Truncated value={c.caution_notes} /> },

      // ─── Col 111 (DG): メンタリング満足度 ───
      { key: "mentoring_satisfaction", label: "メンタリング満足度", width: 130, render: (c) => c.learning?.mentoring_satisfaction || "-" },

      // ─── Col 118 (DN): エージェント失注理由 ───
      { key: "loss_reason", label: "エージェント失注理由", width: 140, render: (c) => <Truncated value={c.agent?.loss_reason} /> },

      // ─── Col 119 (DO): 請求書用 ───
      { key: "invoice_info", label: "請求書用", width: 120, render: (c) => <Truncated value={c.contract?.invoice_info} width={120} /> },

      // ─── Col 121 (DQ): 請求状況 ───
      { key: "billing_status", label: "請求状況", width: 90, render: (c) => c.contract?.billing_status || "-" },

      // ─── Col 122 (DR): 別経由での応募 ───
      { key: "alternative_application", label: "別経由応募", width: 100, render: (c) => c.pipeline?.alternative_application || "-" },

      // ─── Col 128 (DX): 人材紹介報酬期待値 ───
      { key: "expected_referral_fee", label: "人材紹介報酬期待値", width: 140, align: "right" as const, render: (c) => {
        const v = calcExpectedReferralFee(c);
        return v > 0 ? formatCurrency(v) : "-";
      }, sortValue: (c) => calcExpectedReferralFee(c) },

      // ─── Col 130 (DZ): 転職意向 ───
      { key: "transfer_intent", label: "転職意向", width: 100, render: (c) => c.transfer_intent || "-" },

      // ─── Col 131 (EA): 大学名 ───
      { key: "university", label: "大学名", width: 130, render: (c) => c.university || "-", sortValue: (c) => c.university || "" },

      // ─── Col 132 (EB): 受講開始日メール送付済み ───
      { key: "start_email_sent", label: "開始メール送付", width: 110, render: (c) => c.learning?.start_email_sent || "-" },

      // ─── Col 133 (EC): [追加指導]営業内容 ───
      { key: "additional_sales_content", label: "[追加]営業内容", width: 140, render: (c) => <Truncated value={c.pipeline?.additional_sales_content} /> },

      // ─── Col 134 (ED): [追加指導]プラン ───
      { key: "additional_plan", label: "[追加]プラン", width: 120, render: (c) => c.pipeline?.additional_plan || "-" },

      // ─── Col 135 (EE): [追加指導]割引制度の案内 ───
      { key: "additional_discount_info", label: "[追加]割引案内", width: 120, render: (c) => <Truncated value={c.pipeline?.additional_discount_info} width={120} /> },

      // ─── Col 136 (EF): [追加指導]学び ───
      { key: "additional_notes", label: "[追加]学び", width: 120, render: (c) => <Truncated value={c.pipeline?.additional_notes} width={120} /> },

      // ─── Col 137 (EG): エージェント担当者 ───
      { key: "agent_staff", label: "エージェント担当者", width: 120, render: (c) => c.agent?.agent_staff || "-" },

      // ─── Col 139 (EI): リスキャリ補助金対象 ───
      { key: "subsidy_eligible", label: "補助金対象", width: 90, render: (c) => c.contract?.subsidy_eligible ? "対象" : "-" },

      // ─── Col 140 (EJ): 補助金額 ───
      { key: "subsidy_amount", label: "補助金額", width: 100, align: "right" as const, render: (c) => {
        const v = getSubsidyAmount(c);
        return v > 0 ? formatCurrency(v) : "-";
      }, sortValue: (c) => getSubsidyAmount(c) },

      // ─── Col 141 (EK): 人材確定 ───
      { key: "placement_confirmed", label: "人材確定", width: 80, align: "center" as const, render: (c) =>
        isAgentConfirmed(c) ? <span className="text-green-400">確定</span> : "-" },

      // ─── 計算フィールド: 成約見込率 (Excel Col DB) ───
      { key: "closing_prob", label: "成約見込率", width: 90, align: "right" as const, render: (c) => formatPercent(calcClosingProbability(c)), sortValue: (c) => calcClosingProbability(c) },

      // ─── 計算フィールド: 見込LTV (Excel Col DD) ───
      { key: "expected_ltv", label: "見込LTV", width: 110, align: "right" as const, render: (c) => {
        const v = calcExpectedLTV(c);
        return v > 0 ? formatCurrency(v) : "-";
      }, sortValue: (c) => calcExpectedLTV(c) },

      // ─── エージェント利用（計算） ───
      { key: "agent_enrolled", label: "エージェント利用", width: 110, align: "center" as const, render: (c) =>
        isAgentCustomer(c) ? <span className="text-green-400">利用中</span> : "-" },
    ],
    []
  );

  return (
    <div className="p-4 space-y-2">
      {/* コンパクトヘッダー: タイトル + フィルタ + ビュー切替を1行に */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-bold text-white shrink-0">顧客一覧</h1>
        <span className="text-xs text-gray-500 shrink-0">
          {viewMode === "spreadsheet" ? baseFiltered.length : filtered.length}件
        </span>
        <select
          value={attributeFilter}
          onChange={(e) => setAttributeFilter(e.target.value)}
          className="px-2 py-1 bg-surface-elevated border border-white/10 text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">全属性</option>
          <option value="既卒">既卒</option>
          <option value="新卒">新卒</option>
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="px-2 py-1 bg-surface-elevated border border-white/10 text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">全ステージ</option>
          <option value="問い合わせ">問い合わせ</option>
          <option value="日程確定">日程確定</option>
          <option value="面談実施">面談実施</option>
          <option value="提案中">提案中</option>
          <option value="成約">成約</option>
          <option value="入金済">入金済</option>
          <option value="失注">失注</option>
          <option value="保留">保留</option>
        </select>
        {viewMode === "design" && (
          <>
            <input
              type="text"
              placeholder="名前・メール・電話で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[160px] px-2 py-1 bg-surface-elevated border border-white/10 text-white placeholder-gray-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <select
              value={`${sortBy}-${sortDir}`}
              onChange={(e) => {
                const [by, dir] = e.target.value.split("-");
                setSortBy(by);
                setSortDir(dir as "asc" | "desc");
              }}
              className="px-2 py-1 bg-surface-elevated border border-white/10 text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="application_date-desc">申込日↓</option>
              <option value="application_date-asc">申込日↑</option>
              <option value="name-asc">名前A-Z</option>
              <option value="amount-desc">金額↓</option>
            </select>
          </>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="flex bg-surface-elevated rounded p-0.5 border border-white/10">
            <button
              onClick={() => setViewMode("spreadsheet")}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                viewMode === "spreadsheet"
                  ? "bg-brand text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              表
            </button>
            <button
              onClick={() => setViewMode("design")}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                viewMode === "design"
                  ? "bg-brand text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              カード
            </button>
          </div>
        </div>
      </div>

      {viewMode === "spreadsheet" ? (
        /* スプレッドシートビュー */
        <SpreadsheetTable
          columns={spreadsheetColumns}
          data={baseFiltered}
          getRowKey={(c) => c.id}
          storageKey="customers-main"
          searchPlaceholder="名前・メール・電話・大学・経歴で検索..."
          searchFilter={(c, q) =>
            c.name.toLowerCase().includes(q) ||
            (c.email?.toLowerCase().includes(q) ?? false) ||
            (c.phone?.includes(q) ?? false) ||
            (c.university?.toLowerCase().includes(q) ?? false) ||
            (c.career_history?.toLowerCase().includes(q) ?? false)
          }
        />
      ) : (
        /* デザインビュー（既存） */
        <>
          <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-elevated border-b border-white/10">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">顧客</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">属性</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">流入元</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">ステージ</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">商談状況</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">売上見込</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">申込日</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-b border-white/[0.08] hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="flex items-center gap-3 group"
                        >
                          <div className="w-9 h-9 bg-brand-muted text-brand rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                            {customer.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-white group-hover:text-brand transition-colors">
                              {customer.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {customer.email || "-"}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(customer.attribute)}`}
                        >
                          {customer.attribute}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {customer.utm_source || "-"}
                      </td>
                      <td className="py-3 px-4">
                        {customer.pipeline && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(customer.pipeline.stage)}`}
                          >
                            {customer.pipeline.stage}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {customer.pipeline && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDealStatusColor(customer.pipeline.deal_status)}`}
                          >
                            {customer.pipeline.deal_status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-white">
                        {(() => {
                          const v = calcSalesProjection(customer);
                          return v > 0 ? formatCurrency(v) : "-";
                        })()}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {formatDate(customer.application_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
