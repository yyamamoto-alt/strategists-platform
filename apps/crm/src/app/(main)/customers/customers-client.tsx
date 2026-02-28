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
    <span className="truncate block" style={{ maxWidth: width }} title={value || ""}>
      {value || "-"}
    </span>
  );
}

// ================================================================
// ビュータブ定義
// ================================================================
type ViewTab = "all" | "marketing" | "sales" | "education" | "agent";

const VIEW_TABS: { key: ViewTab; label: string }[] = [
  { key: "all", label: "全般" },
  { key: "marketing", label: "マーケ" },
  { key: "sales", label: "営業" },
  { key: "education", label: "エデュ" },
  { key: "agent", label: "エージェント" },
];

// タブごとに表示するカラムキーの定義
const VIEW_COLUMNS: Record<ViewTab, string[] | null> = {
  // null = 全カラム表示
  all: null,
  marketing: [
    "name", "rev_total",
    "application_date", "email", "attribute",
    "utm_source", "utm_medium", "utm_id", "utm_campaign",
    "initial_channel", "stage", "deal_status",
    "first_reward_category", "performance_reward_category",
    "google_ads_target", "marketing_memo", "comparison_services",
    "sales_route", "lead_time",
  ],
  sales: [
    "name", "rev_total",
    "application_date", "attribute", "stage", "deal_status",
    "projected_amount", "confirmed_amount", "first_amount", "discount",
    "probability", "sales_date", "response_date",
    "sales_person", "sales_content", "sales_strategy",
    "decision_factor", "application_reason",
    "agent_confirmation", "jicoo_message",
    "referral_category", "referral_status",
    "additional_sales_content", "additional_plan", "additional_discount_info",
    "alternative_application",
  ],
  education: [
    "name", "rev_total",
    "attribute", "enrollment_status", "plan_name", "mentor_name",
    "coaching_start", "coaching_end", "last_coaching",
    "contract_months", "total_sessions", "completed_sessions",
    "remaining_sessions", "weekly_sessions",
    "attendance_rate", "session_completion_rate", "progress_status",
    "level_fermi", "level_case", "level_mck",
    "progress_text", "selection_status", "level_up_range",
    "initial_coaching_level", "enrollment_form_date",
    "coaching_requests", "enrollment_reason",
    "behavior_session1", "behavior_session2",
    "assessment_session1", "assessment_session2",
    "case_interview_progress", "case_interview_weaknesses",
    "interview_timing_at_end", "target_companies_at_end",
    "offer_probability_at_end", "additional_coaching_proposal",
    "mentoring_satisfaction", "start_email_sent",
  ],
  agent: [
    "name", "rev_total",
    "attribute", "is_agent_customer", "referral_category", "referral_status",
    "rev_agent", "rev_subsidy",
    "expected_referral_fee", "agent_projected_revenue",
    "offer_company", "external_agents",
    "hire_rate", "offer_probability", "offer_salary",
    "referral_fee_rate", "margin",
    "placement_confirmed", "placement_date",
    "agent_staff", "agent_memo", "loss_reason",
    "subsidy_eligible",
  ],
};

export function CustomersClient({ customers }: CustomersClientProps) {
  const [attributeFilter, setAttributeFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ViewTab>("all");

  // 属性・ステージフィルタ
  const baseFiltered = useMemo(() => {
    let result = [...customers];
    if (attributeFilter) {
      if (attributeFilter === "既卒") {
        result = result.filter((c) => c.attribute.includes("既卒"));
      } else if (attributeFilter === "新卒") {
        result = result.filter((c) => !c.attribute.includes("既卒"));
      }
    }
    if (stageFilter) {
      result = result.filter((c) => c.pipeline?.stage === stageFilter);
    }
    return result;
  }, [customers, attributeFilter, stageFilter]);

  // ==============================================================
  // 全カラム定義（重複を整理済み）
  // ==============================================================
  const allColumns: SpreadsheetColumn<CustomerWithRelations>[] = useMemo(
    () => [
      // ─── Col B: 名前 [sticky] ───
      { key: "name", label: "名前", width: 140, render: (c) => (
        <Link href={`/customers/${c.id}`} className="text-brand hover:underline">{c.name}</Link>
      ), sortValue: (c) => c.name },

      // ═══ 売上サマリー（合計のみ。詳細は営業/エージェントタブで） ═══
      { key: "rev_total", label: "合計売上見込み", width: 130, align: "right" as const, computed: true,
        formula: "確定売上 + 人材見込み売上(人材紹介顧客のみ) + 補助金",
        render: (c) => {
        const school = c.contract?.confirmed_amount || 0;
        const agent = isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0;
        const subsidy = getSubsidyAmount(c);
        const total = school + agent + subsidy;
        return total > 0 ? <span className="font-semibold text-brand">{formatCurrency(total)}</span> : "-";
      }, sortValue: (c) => {
        const school = c.contract?.confirmed_amount || 0;
        const agent = isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0;
        return school + agent + getSubsidyAmount(c);
      } },

      // ─── Col A: 申込日 ───
      { key: "application_date", label: "申込日", width: 100, render: (c) => formatDate(c.application_date), sortValue: (c) => c.application_date || "" },

      // ─── Col C: メアド ───
      { key: "email", label: "メアド", width: 180, render: (c) => c.email || "-" },

      // ─── Col D: 電話番号 ───
      { key: "phone", label: "電話番号", width: 130, render: (c) => c.phone || "-" },

      // ─── Col E-H: UTM ───
      { key: "utm_source", label: "utm_source", width: 100, render: (c) => c.utm_source || "-", sortValue: (c) => c.utm_source || "" },
      { key: "utm_medium", label: "utm_medium", width: 100, render: (c) => c.utm_medium || "-" },
      { key: "utm_id", label: "utm_id", width: 80, render: (c) => c.utm_id || "-" },
      { key: "utm_campaign", label: "utm_campaign", width: 120, render: (c) => c.utm_campaign || "-" },

      // ─── Col I: 属性 ───
      { key: "attribute", label: "属性", width: 70, render: (c) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(c.attribute)}`}>{c.attribute}</span>
      ), sortValue: (c) => c.attribute },

      // ─── Col J: 経歴 ───
      { key: "career_history", label: "経歴", width: 200, render: (c) => <Truncated value={c.career_history} width={200} /> },

      // ─── Col K: 申込時点エージェント ───
      { key: "agent_interest", label: "申込時エージェント", width: 130, render: (c) =>
        c.pipeline?.agent_interest_at_application ? "○" : "-" },

      // ─── Col L: 面接予定時期 ───
      { key: "meeting_scheduled", label: "面接予定時期", width: 110, render: (c) => formatDate(c.pipeline?.meeting_scheduled_date ?? null), sortValue: (c) => c.pipeline?.meeting_scheduled_date || "" },

      // ─── Col M: 検討状況 ───
      { key: "stage", label: "検討状況", width: 90, render: (c) => c.pipeline ? (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(c.pipeline.stage)}`}>{c.pipeline.stage}</span>
      ) : "-", sortValue: (c) => c.pipeline?.stage || "" },

      // ─── Col N: 売上見込 ───
      { key: "projected_amount", label: "売上見込", width: 110, align: "right" as const, computed: true,
        formula: "確定売上 + 人材見込売上 + 補助金額\n(DB保存値を優先表示)",
        render: (c) => {
        const v = calcSalesProjection(c);
        return v > 0 ? formatCurrency(v) : "-";
      }, sortValue: (c) => calcSalesProjection(c) },

      // ─── Col O: 検討・失注理由 ───
      { key: "decision_factor", label: "検討・失注理由", width: 140, render: (c) => <Truncated value={c.pipeline?.decision_factor} /> },

      // ─── Col P: 実施状況 ───
      { key: "deal_status", label: "実施状況", width: 90, render: (c) => c.pipeline ? (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDealStatusColor(c.pipeline.deal_status)}`}>{c.pipeline.deal_status}</span>
      ) : "-", sortValue: (c) => c.pipeline?.deal_status || "" },

      // ─── Col Q: 初回認知経路 ───
      { key: "initial_channel", label: "初回認知経路", width: 120, render: (c) => c.pipeline?.initial_channel || "-" },

      // ─── Col R: 申し込みの決め手 ───
      { key: "application_reason", label: "申し込みの決め手", width: 140, render: (c) => <Truncated value={c.application_reason} /> },

      // ─── Col S: 営業実施日 ───
      { key: "sales_date", label: "営業実施日", width: 100, render: (c) => formatDate(c.pipeline?.sales_date ?? null), sortValue: (c) => c.pipeline?.sales_date || "" },

      // ─── Col T: 確度 ───
      { key: "probability", label: "確度", width: 70, align: "right" as const, render: (c) =>
        c.pipeline?.probability != null ? formatPercent(c.pipeline.probability) : "-",
        sortValue: (c) => c.pipeline?.probability || 0 },

      // ─── Col U: 返答日/仮入会日 ───
      { key: "response_date", label: "返答日", width: 100, render: (c) => formatDate(c.pipeline?.response_date ?? null) },

      // ─── Col V: 営業担当 ───
      { key: "sales_person", label: "営業担当", width: 90, render: (c) => c.pipeline?.sales_person || "-" },

      // ─── Col W: 営業内容 ───
      { key: "sales_content", label: "営業内容", width: 180, render: (c) => <Truncated value={c.pipeline?.sales_content} width={180} /> },

      // ─── Col X: 営業方針 ───
      { key: "sales_strategy", label: "営業方針", width: 140, render: (c) => <Truncated value={c.pipeline?.sales_strategy} /> },

      // ─── Col Y: jicooメッセージ ───
      { key: "jicoo_message", label: "jicooメッセージ", width: 140, render: (c) => <Truncated value={c.pipeline?.jicoo_message} /> },

      // ─── Col Z: エージェント利用意向 ───
      { key: "agent_confirmation", label: "エージェント利用意向", width: 130, render: (c) => c.pipeline?.agent_confirmation || "-" },

      // ─── Col AA: マーケメモ ───
      { key: "marketing_memo", label: "マーケメモ", width: 140, render: (c) => <Truncated value={c.pipeline?.marketing_memo} /> },

      // ─── Col AB: 経路(営業担当記入) ───
      { key: "sales_route", label: "経路(営業)", width: 120, render: (c) => c.pipeline?.sales_route || c.pipeline?.route_by_sales || "-" },

      // ─── Col AC: 比較サービス ───
      { key: "comparison_services", label: "比較サービス", width: 140, render: (c) => <Truncated value={c.pipeline?.comparison_services} /> },

      // ─── Col AD: 一次報酬分類 ───
      { key: "first_reward_category", label: "一次報酬分類", width: 110, render: (c) => c.pipeline?.first_reward_category || "-" },

      // ─── Col AE: 成果報酬分類 ───
      { key: "performance_reward_category", label: "成果報酬分類", width: 110, render: (c) => c.pipeline?.performance_reward_category || "-" },

      // ─── Col AF: リードタイム ───
      { key: "lead_time", label: "リードタイム", width: 100, render: (c) => c.pipeline?.lead_time || "-" },

      // ─── Col AG: Google広告成果対象 ───
      { key: "google_ads_target", label: "Google広告", width: 110, render: (c) => c.pipeline?.google_ads_target || "-" },

      // ─── Col AH: 人材紹介区分 ───
      { key: "referral_category", label: "人材紹介区分", width: 110, render: (c) => c.contract?.referral_category || "-" },

      // ─── Col AI: 紹介ステータス ───
      { key: "referral_status", label: "紹介ステータス", width: 110, render: (c) => c.contract?.referral_status || "-" },

      // ─── Col AJ: 一次報酬請求予定額 ───
      { key: "first_amount", label: "一次報酬額", width: 110, align: "right" as const, render: (c) =>
        c.contract?.first_amount ? formatCurrency(c.contract.first_amount) : "-",
        sortValue: (c) => c.contract?.first_amount || 0 },

      // ─── Col AK: 確定売上 ───
      { key: "confirmed_amount", label: "確定売上", width: 110, align: "right" as const, render: (c) =>
        c.contract?.confirmed_amount ? formatCurrency(c.contract.confirmed_amount) : "-",
        sortValue: (c) => c.contract?.confirmed_amount || 0 },

      // ─── Col AL: 割引 ───
      { key: "discount", label: "割引", width: 80, align: "right" as const, render: (c) =>
        c.contract?.discount ? formatCurrency(c.contract.discount) : "-" },

      // ─── Col AM: Progress Sheet ───
      { key: "progress_sheet", label: "Progress Sheet", width: 120, render: (c) =>
        c.contract?.progress_sheet_url ? (
          <a href={c.contract.progress_sheet_url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline text-xs">リンク</a>
        ) : "-" },

      // ─── Col AN: 受講状況 ───
      { key: "enrollment_status", label: "受講状況", width: 100, render: (c) => c.contract?.enrollment_status || "-" },

      // ─── Col AO: 受講サービス名 ───
      { key: "plan_name", label: "受講サービス名", width: 160, render: (c) => <Truncated value={c.contract?.plan_name} width={160} /> },

      // ─── Col AP: 指導メンター ───
      { key: "mentor_name", label: "指導メンター", width: 100, render: (c) => c.learning?.mentor_name || "-" },

      // ─── Col AQ: 入金日 ───
      { key: "payment_date", label: "入金日", width: 100, render: (c) => formatDate(c.contract?.payment_date ?? null), sortValue: (c) => c.contract?.payment_date || "" },

      // ─── Col AR: 指導開始日 ───
      { key: "coaching_start", label: "指導開始日", width: 100, render: (c) => formatDate(c.learning?.coaching_start_date ?? null), sortValue: (c) => c.learning?.coaching_start_date || "" },

      // ─── Col AS: 指導終了日 ───
      { key: "coaching_end", label: "指導終了日", width: 100, render: (c) => formatDate(c.learning?.coaching_end_date ?? null), sortValue: (c) => c.learning?.coaching_end_date || "" },

      // ─── Col AT: 最終指導日 ───
      { key: "last_coaching", label: "最終指導日", width: 100, render: (c) => formatDate(c.learning?.last_coaching_date ?? null) },

      // ─── Col AU: 契約月数 ───
      { key: "contract_months", label: "契約月数", width: 80, align: "right" as const, render: (c) =>
        c.learning?.contract_months != null ? `${c.learning.contract_months}ヶ月` : "-" },

      // ─── Col AV: 契約指導回数 ───
      { key: "total_sessions", label: "契約指導回数", width: 100, align: "right" as const, render: (c) =>
        c.learning?.total_sessions != null ? `${c.learning.total_sessions}回` : "-",
        sortValue: (c) => c.learning?.total_sessions || 0 },

      // ─── Col AW: 週あたり指導数 ───
      { key: "weekly_sessions", label: "週あたり指導数", width: 110, align: "right" as const, render: (c) =>
        c.learning?.weekly_sessions != null ? `${c.learning.weekly_sessions}回` : "-" },

      // ─── Col AX: 指導完了数 ───
      { key: "completed_sessions", label: "指導完了数", width: 90, align: "right" as const, render: (c) =>
        c.learning?.completed_sessions != null ? `${c.learning.completed_sessions}回` : "-",
        sortValue: (c) => c.learning?.completed_sessions || 0 },

      // ─── 残指導回数（計算） ───
      { key: "remaining_sessions", label: "残指導回数", width: 90, align: "right" as const, computed: true,
        formula: "契約指導回数 − 指導完了数",
        render: (c) => {
        const r = calcRemainingSessions(c);
        return c.learning ? `${r}回` : "-";
      }, sortValue: (c) => calcRemainingSessions(c) },

      // ─── Col AY: 日程消化率 ───
      { key: "attendance_rate", label: "日程消化率", width: 90, align: "right" as const, computed: true,
        formula: "(現在日 − 指導開始日) / (指導終了日 − 指導開始日)",
        render: (c) => {
        const v = calcScheduleProgress(c);
        return v !== null ? formatPercent(v) : (c.learning?.attendance_rate != null ? formatPercent(c.learning.attendance_rate) : "-");
      } },

      // ─── Col AZ: 指導消化率 ───
      { key: "session_completion_rate", label: "指導消化率", width: 90, align: "right" as const, computed: true,
        formula: "指導完了数 / 契約指導回数",
        render: (c) => {
        const v = calcSessionProgress(c);
        return v !== null ? formatPercent(v) : "-";
      } },

      // ─── 進捗ステータス（計算） ───
      { key: "progress_status", label: "進捗", width: 60, align: "center" as const, computed: true,
        formula: "日程消化率 / 指導消化率 > 1.5 → 遅延\nそれ以外 → 順調",
        render: (c) => {
        const s = calcProgressStatus(c);
        const color = s === "順調" ? "text-green-400" : s === "遅延" ? "text-red-400" : "text-gray-500";
        return <span className={color}>{s}</span>;
      } },

      // ─── Col BA: 進捗テキスト ───
      { key: "progress_text", label: "進捗テキスト", width: 140, render: (c) => <Truncated value={c.learning?.progress_text} /> },

      // ─── Col BB-BD: レベル ───
      { key: "level_fermi", label: "フェルミ", width: 70, render: (c) => c.learning?.level_fermi || "-" },
      { key: "level_case", label: "ケース", width: 70, render: (c) => c.learning?.level_case || "-" },
      { key: "level_mck", label: "McK", width: 70, render: (c) => c.learning?.level_mck || "-" },

      // ─── Col BF: 選考状況 ───
      { key: "selection_status", label: "選考状況", width: 120, render: (c) => <Truncated value={c.learning?.selection_status} width={120} /> },

      // ─── Col BG: レベルアップ幅 ───
      { key: "level_up_range", label: "レベルアップ幅", width: 110, render: (c) => c.learning?.level_up_range || "-" },

      // ─── Col BH: 面接予定時期(終了時) ───
      { key: "interview_timing_at_end", label: "面接予定時期(終了時)", width: 140, render: (c) => <Truncated value={c.learning?.interview_timing_at_end} /> },

      // ─── Col BI: 受験企業(終了時) ───
      { key: "target_companies_at_end", label: "受験企業(終了時)", width: 140, render: (c) => <Truncated value={c.learning?.target_companies_at_end} /> },

      // ─── Col BJ: 内定確度判定 ───
      { key: "offer_probability_at_end", label: "内定確度判定", width: 100, render: (c) => c.learning?.offer_probability_at_end || "-" },

      // ─── Col BK: 追加指導提案 ───
      { key: "additional_coaching_proposal", label: "追加指導提案", width: 140, render: (c) => <Truncated value={c.learning?.additional_coaching_proposal} /> },

      // ─── Col BL: 指導開始時レベル ───
      { key: "initial_coaching_level", label: "指導開始時レベル", width: 120, render: (c) => c.learning?.initial_coaching_level || "-" },

      // ─── Col BM: 入会フォーム提出日 ───
      { key: "enrollment_form_date", label: "入会フォーム日", width: 110, render: (c) => formatDate(c.learning?.enrollment_form_date ?? null) },

      // ─── Col BN: 指導要望 ───
      { key: "coaching_requests", label: "指導要望", width: 140, render: (c) => <Truncated value={c.learning?.coaching_requests} /> },

      // ─── Col BO: 入会理由 ───
      { key: "enrollment_reason", label: "入会理由", width: 140, render: (c) => <Truncated value={c.learning?.enrollment_reason} /> },

      // ─── Col BP: エージェント業務メモ ───
      { key: "agent_memo", label: "エージェント業務メモ", width: 160, render: (c) => <Truncated value={c.agent?.agent_memo} width={160} /> },

      // ─── Col BQ-BR: ビヘイビア ───
      { key: "behavior_session1", label: "ビヘイビア1回目", width: 120, render: (c) => <Truncated value={c.learning?.behavior_session1} width={120} /> },
      { key: "behavior_session2", label: "ビヘイビア2回目", width: 120, render: (c) => <Truncated value={c.learning?.behavior_session2} width={120} /> },

      // ─── Col BS-BT: アセスメント ───
      { key: "assessment_session1", label: "アセスメント1回目", width: 130, render: (c) => <Truncated value={c.learning?.assessment_session1} width={130} /> },
      { key: "assessment_session2", label: "アセスメント2回目", width: 130, render: (c) => <Truncated value={c.learning?.assessment_session2} width={130} /> },

      // ─── Col BU: 人材見込売上 ───
      { key: "agent_projected_revenue", label: "人材見込売上", width: 120, align: "right" as const, computed: true,
        formula: "成約 AND 受講中 AND 人材紹介顧客 → 人材紹介報酬期待値\n一部利用: × 0.5",
        render: (c) => {
        const dbVal = c.agent?.expected_agent_revenue;
        const calcVal = calcAgentProjectedRevenue(c);
        const v = (dbVal && dbVal > 0) ? dbVal : calcVal;
        return v > 0 ? formatCurrency(v) : "-";
      }, sortValue: (c) => c.agent?.expected_agent_revenue || calcAgentProjectedRevenue(c) },

      // ─── 人材見込み売上（サマリー用、エージェントタブ表示） ───
      { key: "rev_agent", label: "人材見込み売上", width: 130, align: "right" as const, computed: true,
        formula: "想定年収 × 入社至る率 × 内定確度 × 紹介料率 × マージン\n※人材紹介顧客のみ",
        render: (c) => {
        if (!isAgentCustomer(c)) return "-";
        const v = calcExpectedReferralFee(c);
        return v > 0 ? formatCurrency(v) : "-";
      }, sortValue: (c) => isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0 },

      // ─── 補助金売上（サマリー用、エージェントタブ表示） ───
      { key: "rev_subsidy", label: "補助金売上", width: 110, align: "right" as const, computed: true,
        formula: "IF(補助金対象 = \"対象\", 補助金額, 0)\nデフォルト: ¥203,636",
        render: (c) => {
        const v = getSubsidyAmount(c);
        return v > 0 ? formatCurrency(v) : "-";
      }, sortValue: (c) => getSubsidyAmount(c) },

      // ─── 人材紹介顧客フラグ ───
      { key: "is_agent_customer", label: "人材紹介顧客", width: 110, align: "center" as const, computed: true,
        formula: "人材紹介区分 = \"フル利用\" OR \"一部利用\"",
        render: (c) =>
        isAgentCustomer(c)
          ? <span className="text-green-400 font-medium">true</span>
          : <span className="text-gray-500">false</span>,
        sortValue: (c) => isAgentCustomer(c) ? 1 : 0 },

      // ─── Col BV: 延長分(日) ───
      { key: "extension_days", label: "延長分(日)", width: 90, align: "right" as const, render: (c) =>
        c.learning?.extension_days != null ? `${c.learning.extension_days}日` : "-" },

      // ─── Col BW: 内定先 ───
      { key: "offer_company", label: "内定先", width: 140, render: (c) => c.agent?.offer_company || "-" },

      // ─── Col BX: 利用エージェント ───
      { key: "external_agents", label: "利用エージェント", width: 120, render: (c) => c.agent?.external_agents || "-" },

      // ─── Col BY: 入社至る率 ───
      { key: "hire_rate", label: "入社至る率", width: 90, align: "right" as const, render: (c) =>
        c.agent?.hire_rate != null ? formatPercent(c.agent.hire_rate) : "-" },

      // ─── Col BZ: 内定確度 ───
      { key: "offer_probability", label: "内定確度", width: 90, align: "right" as const, render: (c) =>
        c.agent?.offer_probability != null ? formatPercent(c.agent.offer_probability) : "-" },

      // ─── Col CA: 想定年収 ───
      { key: "offer_salary", label: "想定年収", width: 110, align: "right" as const, render: (c) =>
        c.agent?.offer_salary ? formatCurrency(c.agent.offer_salary) : "-",
        sortValue: (c) => c.agent?.offer_salary || 0 },

      // ─── Col CB: 紹介料率 ───
      { key: "referral_fee_rate", label: "紹介料率", width: 80, align: "right" as const, render: (c) =>
        c.agent?.referral_fee_rate != null ? formatPercent(c.agent.referral_fee_rate) : "-" },

      // ─── Col CC: マージン ───
      { key: "margin", label: "マージン", width: 80, align: "right" as const, render: (c) => {
        if (!c.agent) return "-";
        const m = (c.agent.margin && c.agent.margin > 0) ? c.agent.margin : 0.75;
        return formatPercent(m);
      } },

      // ─── Col CD: 入社予定日 ───
      { key: "placement_date", label: "入社予定日", width: 100, render: (c) => formatDate(c.agent?.placement_date ?? null) },

      // ─── Col CE: メモ ───
      { key: "general_memo", label: "メモ", width: 160, render: (c) => <Truncated value={c.agent?.general_memo} width={160} /> },

      // ─── Col CF-CG: カルテ情報 ───
      { key: "karte_email", label: "メアド(カルテ)", width: 160, render: (c) => c.karte_email || "-" },
      { key: "karte_phone", label: "電話(カルテ)", width: 120, render: (c) => c.karte_phone || "-" },

      // ─── Col CH: 生年月日 ───
      { key: "birth_date", label: "生年月日", width: 100, render: (c) => formatDate(c.birth_date ?? null) },

      // ─── Col CI: フリガナ ───
      { key: "name_kana", label: "フリガナ", width: 120, render: (c) => c.name_kana || "-" },

      // ─── Col CJ: 志望企業 ───
      { key: "target_companies", label: "志望企業", width: 160, render: (c) => <Truncated value={c.target_companies} width={160} /> },

      // ─── Col CK: 対策ファーム ───
      { key: "target_firm_type", label: "対策ファーム", width: 120, render: (c) => c.target_firm_type || "-" },

      // ─── Col CL: 申込時レベル ───
      { key: "initial_level", label: "申込時レベル", width: 100, render: (c) => c.initial_level || "-" },

      // ─── Col CM: ケース面接対策の進捗 ───
      { key: "case_interview_progress", label: "ケース面接対策進捗", width: 160, render: (c) => <Truncated value={c.learning?.case_interview_progress} width={160} /> },

      // ─── Col CN: ケース面接で苦手なこと ───
      { key: "case_interview_weaknesses", label: "ケース面接苦手", width: 140, render: (c) => <Truncated value={c.learning?.case_interview_weaknesses} /> },

      // ─── Col CO: 申込の決め手(カルテ) ───
      { key: "application_reason_karte", label: "申込の決め手(カルテ)", width: 160, render: (c) => <Truncated value={c.application_reason_karte} width={160} /> },

      // ─── Col CP: 有料プログラムへの関心 ───
      { key: "program_interest", label: "有料プログラム関心", width: 140, render: (c) => <Truncated value={c.program_interest} /> },

      // ─── Col CQ: 希望期間・頻度 ───
      { key: "desired_schedule", label: "希望期間・頻度", width: 120, render: (c) => <Truncated value={c.desired_schedule} width={120} /> },

      // ─── Col CR: ご購入いただいたコンテンツ ───
      { key: "purchased_content", label: "購入コンテンツ", width: 140, render: (c) => <Truncated value={c.purchased_content} /> },

      // ─── Col CS: 親御様からの支援 ───
      { key: "parent_support", label: "親御様支援", width: 100, render: (c) => c.parent_support || "-" },

      // ─── Col CT: 就活アカウント(X) ───
      { key: "sns_accounts", label: "就活アカウント", width: 120, render: (c) => c.sns_accounts || "-" },

      // ─── Col CU: 参考メディア ───
      { key: "reference_media", label: "参考メディア", width: 120, render: (c) => c.reference_media || "-" },

      // ─── Col CV: 趣味・特技 ───
      { key: "hobbies", label: "趣味・特技", width: 120, render: (c) => <Truncated value={c.hobbies} width={120} /> },

      // ─── Col CW: 行動特性 ───
      { key: "behavioral_traits", label: "行動特性", width: 140, render: (c) => <Truncated value={c.behavioral_traits} /> },

      // ─── Col CX: その他要望・特記事項 ───
      { key: "other_background", label: "その他", width: 140, render: (c) => <Truncated value={c.other_background} /> },

      // ─── Col CY: 備考 ───
      { key: "notes", label: "備考", width: 180, render: (c) => <Truncated value={c.notes} width={180} /> },

      // ─── Col CZ: 注意事項 ───
      { key: "caution_notes", label: "注意事項", width: 140, render: (c) => <Truncated value={c.caution_notes} /> },

      // ─── Col DG: メンタリング満足度 ───
      { key: "mentoring_satisfaction", label: "メンタリング満足度", width: 130, render: (c) => c.learning?.mentoring_satisfaction || "-" },

      // ─── Col DN: エージェント失注理由 ───
      { key: "loss_reason", label: "エージェント失注理由", width: 140, render: (c) => <Truncated value={c.agent?.loss_reason} /> },

      // ─── Col DO: 請求書用 ───
      { key: "invoice_info", label: "請求書用", width: 120, render: (c) => <Truncated value={c.contract?.invoice_info} width={120} /> },

      // ─── Col DQ: 請求状況 ───
      { key: "billing_status", label: "請求状況", width: 90, render: (c) => c.contract?.billing_status || "-" },

      // ─── Col DR: 別経由での応募 ───
      { key: "alternative_application", label: "別経由応募", width: 100, render: (c) => c.pipeline?.alternative_application || "-" },

      // ─── Col DX: 人材紹介報酬期待値 ───
      { key: "expected_referral_fee", label: "人材紹介報酬期待値", width: 140, align: "right" as const, computed: true,
        formula: "想定年収 × 入社至る率 × 内定確度 × 紹介料率 × マージン",
        render: (c) => {
        const v = calcExpectedReferralFee(c);
        return v > 0 ? formatCurrency(v) : "-";
      }, sortValue: (c) => calcExpectedReferralFee(c) },

      // ─── Col DZ: 転職意向 ───
      { key: "transfer_intent", label: "転職意向", width: 100, render: (c) => c.transfer_intent || "-" },

      // ─── Col EA: 大学名 ───
      { key: "university", label: "大学名", width: 130, render: (c) => c.university || "-", sortValue: (c) => c.university || "" },

      // ─── Col EB: 受講開始日メール送付済み ───
      { key: "start_email_sent", label: "開始メール送付", width: 110, render: (c) => c.learning?.start_email_sent || "-" },

      // ─── Col EC: [追加指導]営業内容 ───
      { key: "additional_sales_content", label: "[追加]営業内容", width: 140, render: (c) => <Truncated value={c.pipeline?.additional_sales_content} /> },

      // ─── Col ED: [追加指導]プラン ───
      { key: "additional_plan", label: "[追加]プラン", width: 120, render: (c) => c.pipeline?.additional_plan || "-" },

      // ─── Col EE: [追加指導]割引制度の案内 ───
      { key: "additional_discount_info", label: "[追加]割引案内", width: 120, render: (c) => <Truncated value={c.pipeline?.additional_discount_info} width={120} /> },

      // ─── Col EF: [追加指導]学び ───
      { key: "additional_notes", label: "[追加]学び", width: 120, render: (c) => <Truncated value={c.pipeline?.additional_notes} width={120} /> },

      // ─── Col EG: エージェント担当者 ───
      { key: "agent_staff", label: "エージェント担当者", width: 120, render: (c) => c.agent?.agent_staff || "-" },

      // ─── Col EI: リスキャリ補助金対象 ───
      { key: "subsidy_eligible", label: "補助金対象", width: 90, render: (c) => c.contract?.subsidy_eligible ? "対象" : "-" },

      // ─── Col EK: 人材確定 ───
      { key: "placement_confirmed", label: "人材確定", width: 80, align: "center" as const, computed: true,
        formula: "人材確定フラグ = \"確定\"",
        render: (c) =>
        isAgentConfirmed(c) ? <span className="text-green-400">確定</span> : "-" },
    ],
    []
  );

  // タブに応じたカラムフィルタリング
  const spreadsheetColumns = useMemo(() => {
    const allowedKeys = VIEW_COLUMNS[activeTab];
    if (!allowedKeys) return allColumns; // 全般 = 全カラム
    return allColumns.filter((col) => allowedKeys.includes(col.key));
  }, [allColumns, activeTab]);

  return (
    <div className="p-4 space-y-2">
      {/* ヘッダー: タイトル + フィルタ */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-bold text-white shrink-0">顧客一覧</h1>
        <span className="text-xs text-gray-500 shrink-0">
          {baseFiltered.length}件
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
          <optgroup label="アクティブ">
            <option value="日程未確">日程未確</option>
            <option value="検討中">検討中</option>
            <option value="長期検討">長期検討</option>
          </optgroup>
          <optgroup label="成約">
            <option value="成約">成約</option>
            <option value="その他購入">その他購入</option>
            <option value="動画講座購入">動画講座購入</option>
            <option value="追加指導">追加指導</option>
          </optgroup>
          <optgroup label="未実施">
            <option value="NoShow">NoShow</option>
            <option value="未実施">未実施</option>
            <option value="実施不可">実施不可</option>
            <option value="非実施対象">非実施対象</option>
          </optgroup>
          <optgroup label="失注">
            <option value="失注">失注</option>
            <option value="失注見込">失注見込</option>
            <option value="失注見込(自動)">失注見込(自動)</option>
            <option value="CL">CL</option>
            <option value="全額返金">全額返金</option>
          </optgroup>
          <option value="その他">その他</option>
        </select>
      </div>

      {/* ビュータブ */}
      <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5 w-fit border border-white/10">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-brand text-white shadow-sm"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* スプレッドシートビュー */}
      <SpreadsheetTable
        columns={spreadsheetColumns}
        data={baseFiltered}
        getRowKey={(c) => c.id}
        storageKey={`customers-${activeTab}`}
        searchPlaceholder="名前・メール・電話・大学・経歴で検索..."
        searchFilter={(c, q) =>
          c.name.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false) ||
          (c.phone?.includes(q) ?? false) ||
          (c.university?.toLowerCase().includes(q) ?? false) ||
          (c.career_history?.toLowerCase().includes(q) ?? false)
        }
      />
    </div>
  );
}
