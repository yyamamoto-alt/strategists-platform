"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  formatCurrency,
  formatPercent,
  getStageColor,
  getAttributeColor,
  getDealStatusColor,
} from "@/lib/utils";
import type { CustomerWithRelations } from "@strategy-school/shared-db";
import type { ChannelAttribution } from "@/lib/data/marketing-settings";
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
  attributionMap: Record<string, ChannelAttribution>;
}

// 日付フォーマット: YY/MM/DD（26/02/21形式）
function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}/${mm}/${dd}`;
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
  all: null, // 全カラム表示
  marketing: [
    "application_date", "name", "attribute", "stage", "deal_status",
    "rev_total",
    "marketing_channel",
    "utm_source", "utm_medium", "utm_id", "utm_campaign",
    "initial_channel", "application_reason",
    "first_reward_category", "performance_reward_category",
    "google_ads_target", "marketing_memo", "comparison_services",
    "sales_route", "lead_time",
  ],
  sales: [
    "application_date", "name", "attribute", "stage", "deal_status",
    "confirmed_amount", "rev_total", "projected_amount",
    "probability", "sales_date", "response_date",
    "first_amount", "discount",
    "sales_person", "sales_content", "sales_strategy",
    "decision_factor", "application_reason",
    "agent_confirmation", "jicoo_message",
    "referral_category", "referral_status",
    "additional_sales_content", "additional_plan", "additional_discount_info",
    "alternative_application",
  ],
  education: [
    "application_date", "name", "attribute", "stage", "deal_status",
    "rev_total",
    "enrollment_status", "plan_name", "mentor_name",
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
    "application_date", "name", "attribute", "stage", "deal_status",
    "confirmed_amount", "rev_total", "projected_amount",
    "is_agent_customer", "referral_category", "referral_status",
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

export function CustomersClient({ customers, attributionMap }: CustomersClientProps) {
  const [attributeFilter, setAttributeFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ViewTab>("all");

  // フィルタ
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

  // ================================================================
  // 全カラム定義（並び順が表示順）
  // ================================================================
  const allColumns: SpreadsheetColumn<CustomerWithRelations>[] = useMemo(
    () => [
      // ─── 申込日（名前の左） ───
      { key: "application_date", label: "申込日", width: 78, stickyLeft: 0,
        render: (c) => <span className="text-gray-400 text-xs">{fmtDate(c.application_date)}</span>,
        sortValue: (c) => c.application_date || "" },

      // ─── 名前 [sticky] ───
      { key: "name", label: "名前", width: 120, stickyLeft: 78,
        render: (c) => (
          <Link href={`/customers/${c.id}`} className="text-brand hover:underline text-sm">{c.name}</Link>
        ), sortValue: (c) => c.name },

      // ─── 属性（名前の右横） ───
      { key: "attribute", label: "属性", width: 56, category: "base",
        render: (c) => (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getAttributeColor(c.attribute)}`}>{c.attribute.includes("既卒") ? "既卒" : "新卒"}</span>
        ), sortValue: (c) => c.attribute },

      // ─── 検討状況（名前の右横） ───
      { key: "stage", label: "検討状況", width: 85, category: "sales",
        render: (c) => c.pipeline ? (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStageColor(c.pipeline.stage)}`}>{c.pipeline.stage}</span>
        ) : "-", sortValue: (c) => c.pipeline?.stage || "" },

      // ─── 実施状況（検討状況の横） ───
      { key: "deal_status", label: "実施状況", width: 80, category: "sales",
        render: (c) => c.pipeline ? (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getDealStatusColor(c.pipeline.deal_status)}`}>{c.pipeline.deal_status}</span>
        ) : "-", sortValue: (c) => c.pipeline?.deal_status || "" },

      // ═══ 売上3種（近接配置） ═══
      { key: "confirmed_amount", label: "確定売上", width: 100, align: "right" as const, category: "sales",
        render: (c) => c.contract?.confirmed_amount ? formatCurrency(c.contract.confirmed_amount) : "-",
        sortValue: (c) => c.contract?.confirmed_amount || 0 },

      { key: "rev_total", label: "見込含む売上", width: 110, align: "right" as const, computed: true, category: "sales",
        formula: "確定売上 + 人材見込み売上 + 補助金",
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

      { key: "projected_amount", label: "予測売上", width: 100, align: "right" as const, computed: true, category: "sales",
        formula: "確定売上 + 人材見込売上 + 補助金\n(成約確率ベース含む)",
        render: (c) => {
          const v = calcSalesProjection(c);
          return v > 0 ? formatCurrency(v) : "-";
        }, sortValue: (c) => calcSalesProjection(c) },

      // ═══ マーケティング（オレンジ） ═══
      { key: "marketing_channel", label: "帰属チャネル", width: 110, category: "marketing",
        render: (c) => {
          const attr = attributionMap[c.id];
          return attr ? <span className="text-white font-medium text-xs">{attr.marketing_channel}</span> : <span className="text-gray-600 text-xs">-</span>;
        }, sortValue: (c) => attributionMap[c.id]?.marketing_channel || "" },

      { key: "utm_source", label: "utm_source", width: 90, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_source || "-"}</span>, sortValue: (c) => c.utm_source || "" },
      { key: "utm_medium", label: "utm_medium", width: 90, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_medium || "-"}</span> },
      { key: "utm_id", label: "utm_id", width: 70, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_id || "-"}</span> },
      { key: "utm_campaign", label: "utm_campaign", width: 100, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_campaign || "-"}</span> },

      { key: "initial_channel", label: "初回認知経路", width: 110, category: "marketing",
        render: (c) => <span className="text-xs">{c.pipeline?.initial_channel || "-"}</span> },
      { key: "application_reason", label: "申し込みの決め手", width: 130, category: "marketing",
        render: (c) => <Truncated value={c.application_reason} width={130} /> },

      { key: "first_reward_category", label: "一次報酬分類", width: 100, category: "marketing",
        render: (c) => <span className="text-xs">{c.pipeline?.first_reward_category || "-"}</span> },
      { key: "performance_reward_category", label: "成果報酬分類", width: 100, category: "marketing",
        render: (c) => <span className="text-xs">{c.pipeline?.performance_reward_category || "-"}</span> },
      { key: "google_ads_target", label: "Google広告", width: 100, category: "marketing",
        render: (c) => <span className="text-xs">{c.pipeline?.google_ads_target || "-"}</span> },
      { key: "marketing_memo", label: "マーケメモ", width: 130, category: "marketing",
        render: (c) => <Truncated value={c.pipeline?.marketing_memo} width={130} /> },
      { key: "comparison_services", label: "比較サービス", width: 120, category: "marketing",
        render: (c) => <Truncated value={c.pipeline?.comparison_services} width={120} /> },
      { key: "sales_route", label: "経路(営業)", width: 100, category: "marketing",
        render: (c) => <span className="text-xs">{c.pipeline?.sales_route || c.pipeline?.route_by_sales || "-"}</span> },
      { key: "lead_time", label: "リードタイム", width: 90, category: "marketing",
        render: (c) => <span className="text-xs">{c.pipeline?.lead_time || "-"}</span> },

      // ═══ 営業（青） ═══
      { key: "career_history", label: "経歴", width: 180, category: "base",
        render: (c) => <Truncated value={c.career_history} width={180} /> },

      { key: "agent_interest", label: "申込時エージェント", width: 80, category: "sales",
        render: (c) => c.pipeline?.agent_interest_at_application
          ? <span className="text-blue-400">○</span>
          : <span className="text-gray-600">-</span> },

      { key: "meeting_scheduled", label: "面接予定", width: 78, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.pipeline?.meeting_scheduled_date)}</span>,
        sortValue: (c) => c.pipeline?.meeting_scheduled_date || "" },

      { key: "decision_factor", label: "検討・失注理由", width: 130, category: "sales",
        render: (c) => <Truncated value={c.pipeline?.decision_factor} width={130} /> },

      { key: "sales_date", label: "営業日", width: 78, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.pipeline?.sales_date)}</span>,
        sortValue: (c) => c.pipeline?.sales_date || "" },

      { key: "probability", label: "確度", width: 60, align: "right" as const, category: "sales",
        render: (c) => c.pipeline?.probability != null ? formatPercent(c.pipeline.probability) : "-",
        sortValue: (c) => c.pipeline?.probability || 0 },

      { key: "response_date", label: "返答日", width: 78, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.pipeline?.response_date)}</span> },

      { key: "sales_person", label: "営業担当", width: 80, category: "sales",
        render: (c) => <span className="text-xs">{c.pipeline?.sales_person || "-"}</span> },

      { key: "sales_content", label: "営業内容", width: 240, category: "sales", multiline: true,
        render: (c) => c.pipeline?.sales_content || "-" },

      { key: "sales_strategy", label: "営業方針", width: 220, category: "sales", multiline: true,
        render: (c) => c.pipeline?.sales_strategy || "-" },

      { key: "jicoo_message", label: "jicooメッセージ", width: 130, category: "sales",
        render: (c) => <Truncated value={c.pipeline?.jicoo_message} width={130} /> },

      { key: "agent_confirmation", label: "エージェント利用意向", width: 120, category: "sales",
        render: (c) => <span className="text-xs">{c.pipeline?.agent_confirmation || "-"}</span> },

      { key: "first_amount", label: "一次報酬額", width: 100, align: "right" as const, category: "sales",
        render: (c) => c.contract?.first_amount ? formatCurrency(c.contract.first_amount) : "-",
        sortValue: (c) => c.contract?.first_amount || 0 },

      { key: "discount", label: "割引", width: 70, align: "right" as const, category: "sales",
        render: (c) => c.contract?.discount ? formatCurrency(c.contract.discount) : "-" },

      { key: "alternative_application", label: "別経由応募", width: 90, category: "sales",
        render: (c) => <span className="text-xs">{c.pipeline?.alternative_application || "-"}</span> },

      // ─── 追加指導（営業） ───
      { key: "additional_sales_content", label: "[追加]営業内容", width: 130, category: "sales",
        render: (c) => <Truncated value={c.pipeline?.additional_sales_content} width={130} /> },
      { key: "additional_plan", label: "[追加]プラン", width: 110, category: "sales",
        render: (c) => <span className="text-xs">{c.pipeline?.additional_plan || "-"}</span> },
      { key: "additional_discount_info", label: "[追加]割引案内", width: 110, category: "sales",
        render: (c) => <Truncated value={c.pipeline?.additional_discount_info} width={110} /> },

      // ═══ 人材紹介（紫） ═══
      { key: "referral_category", label: "人材紹介区分", width: 100, category: "agent",
        render: (c) => <span className="text-xs">{c.contract?.referral_category || "-"}</span> },
      { key: "referral_status", label: "紹介ステータス", width: 100, category: "agent",
        render: (c) => <span className="text-xs">{c.contract?.referral_status || "-"}</span> },

      { key: "is_agent_customer", label: "人材紹介顧客", width: 90, align: "center" as const, computed: true, category: "agent",
        formula: "人材紹介区分 = \"フル利用\" OR \"一部利用\"",
        render: (c) => isAgentCustomer(c)
          ? <span className="text-purple-400 font-medium text-xs">利用</span>
          : <span className="text-gray-600 text-xs">-</span>,
        sortValue: (c) => isAgentCustomer(c) ? 1 : 0 },

      { key: "rev_agent", label: "人材見込売上", width: 110, align: "right" as const, computed: true, category: "agent",
        formula: "想定年収 × 入社至る率 × 内定確度 × 紹介料率 × マージン",
        render: (c) => {
          if (!isAgentCustomer(c)) return "-";
          const v = calcExpectedReferralFee(c);
          return v > 0 ? formatCurrency(v) : "-";
        }, sortValue: (c) => isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0 },

      { key: "rev_subsidy", label: "補助金売上", width: 100, align: "right" as const, computed: true, category: "agent",
        formula: "IF(補助金対象=\"対象\", ¥203,636, 0)",
        render: (c) => {
          const v = getSubsidyAmount(c);
          return v > 0 ? formatCurrency(v) : "-";
        }, sortValue: (c) => getSubsidyAmount(c) },

      { key: "agent_projected_revenue", label: "人材見込売上(DB)", width: 120, align: "right" as const, computed: true, category: "agent",
        formula: "成約 AND 受講中 AND 人材紹介顧客 → 報酬期待値",
        render: (c) => {
          const dbVal = c.agent?.expected_agent_revenue;
          const calcVal = calcAgentProjectedRevenue(c);
          const v = (dbVal && dbVal > 0) ? dbVal : calcVal;
          return v > 0 ? formatCurrency(v) : "-";
        }, sortValue: (c) => c.agent?.expected_agent_revenue || calcAgentProjectedRevenue(c) },

      { key: "expected_referral_fee", label: "報酬期待値", width: 120, align: "right" as const, computed: true, category: "agent",
        formula: "想定年収 × 入社至る率 × 内定確度 × 紹介料率 × マージン",
        render: (c) => {
          const v = calcExpectedReferralFee(c);
          return v > 0 ? formatCurrency(v) : "-";
        }, sortValue: (c) => calcExpectedReferralFee(c) },

      { key: "offer_company", label: "内定先", width: 120, category: "agent",
        render: (c) => <span className="text-xs">{c.agent?.offer_company || "-"}</span> },
      { key: "external_agents", label: "利用エージェント", width: 110, category: "agent",
        render: (c) => <span className="text-xs">{c.agent?.external_agents || "-"}</span> },
      { key: "hire_rate", label: "入社至る率", width: 80, align: "right" as const, category: "agent",
        render: (c) => c.agent?.hire_rate != null ? formatPercent(c.agent.hire_rate) : "-" },
      { key: "offer_probability", label: "内定確度", width: 80, align: "right" as const, category: "agent",
        render: (c) => c.agent?.offer_probability != null ? formatPercent(c.agent.offer_probability) : "-" },
      { key: "offer_salary", label: "想定年収", width: 100, align: "right" as const, category: "agent",
        render: (c) => c.agent?.offer_salary ? formatCurrency(c.agent.offer_salary) : "-",
        sortValue: (c) => c.agent?.offer_salary || 0 },
      { key: "referral_fee_rate", label: "紹介料率", width: 70, align: "right" as const, category: "agent",
        render: (c) => c.agent?.referral_fee_rate != null ? formatPercent(c.agent.referral_fee_rate) : "-" },
      { key: "margin", label: "マージン", width: 70, align: "right" as const, category: "agent",
        render: (c) => {
          if (!c.agent) return "-";
          const m = (c.agent.margin && c.agent.margin > 0) ? c.agent.margin : 0.75;
          return formatPercent(m);
        } },
      { key: "placement_date", label: "入社予定日", width: 78, category: "agent",
        render: (c) => <span className="text-xs">{fmtDate(c.agent?.placement_date)}</span> },
      { key: "placement_confirmed", label: "人材確定", width: 70, align: "center" as const, computed: true, category: "agent",
        formula: "人材確定フラグ = \"確定\"",
        render: (c) => isAgentConfirmed(c) ? <span className="text-purple-400">確定</span> : "-" },
      { key: "agent_staff", label: "エージェント担当", width: 100, category: "agent",
        render: (c) => <span className="text-xs">{c.agent?.agent_staff || "-"}</span> },
      { key: "agent_memo", label: "エージェント業務メモ", width: 150, category: "agent", multiline: true,
        render: (c) => c.agent?.agent_memo || "-" },
      { key: "loss_reason", label: "失注理由", width: 120, category: "agent",
        render: (c) => <Truncated value={c.agent?.loss_reason} width={120} /> },
      { key: "subsidy_eligible", label: "補助金対象", width: 80, category: "agent",
        render: (c) => c.contract?.subsidy_eligible ? <span className="text-purple-400 text-xs">対象</span> : "-" },

      // ═══ エデュケーション（緑） ═══
      { key: "enrollment_status", label: "受講状況", width: 90, category: "education",
        render: (c) => <span className="text-xs">{c.contract?.enrollment_status || "-"}</span> },
      { key: "plan_name", label: "プラン名", width: 140, category: "education",
        render: (c) => <Truncated value={c.contract?.plan_name} width={140} /> },
      { key: "mentor_name", label: "メンター", width: 80, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.mentor_name || "-"}</span> },
      { key: "coaching_start", label: "指導開始", width: 78, category: "education",
        render: (c) => <span className="text-xs">{fmtDate(c.learning?.coaching_start_date)}</span>,
        sortValue: (c) => c.learning?.coaching_start_date || "" },
      { key: "coaching_end", label: "指導終了", width: 78, category: "education",
        render: (c) => <span className="text-xs">{fmtDate(c.learning?.coaching_end_date)}</span>,
        sortValue: (c) => c.learning?.coaching_end_date || "" },
      { key: "last_coaching", label: "最終指導", width: 78, category: "education",
        render: (c) => <span className="text-xs">{fmtDate(c.learning?.last_coaching_date)}</span> },
      { key: "contract_months", label: "契約月数", width: 70, align: "right" as const, category: "education",
        render: (c) => c.learning?.contract_months != null ? `${c.learning.contract_months}M` : "-" },
      { key: "total_sessions", label: "契約回数", width: 70, align: "right" as const, category: "education",
        render: (c) => c.learning?.total_sessions != null ? `${c.learning.total_sessions}回` : "-",
        sortValue: (c) => c.learning?.total_sessions || 0 },
      { key: "completed_sessions", label: "完了数", width: 60, align: "right" as const, category: "education",
        render: (c) => c.learning?.completed_sessions != null ? `${c.learning.completed_sessions}` : "-",
        sortValue: (c) => c.learning?.completed_sessions || 0 },
      { key: "remaining_sessions", label: "残回数", width: 60, align: "right" as const, computed: true, category: "education",
        formula: "契約指導回数 − 指導完了数",
        render: (c) => { const r = calcRemainingSessions(c); return c.learning ? `${r}` : "-"; },
        sortValue: (c) => calcRemainingSessions(c) },
      { key: "weekly_sessions", label: "週回数", width: 60, align: "right" as const, category: "education",
        render: (c) => c.learning?.weekly_sessions != null ? `${c.learning.weekly_sessions}` : "-" },
      { key: "attendance_rate", label: "日程消化率", width: 80, align: "right" as const, computed: true, category: "education",
        formula: "(現在日 − 開始日) / (終了日 − 開始日)",
        render: (c) => {
          const v = calcScheduleProgress(c);
          return v !== null ? formatPercent(v) : (c.learning?.attendance_rate != null ? formatPercent(c.learning.attendance_rate) : "-");
        } },
      { key: "session_completion_rate", label: "指導消化率", width: 80, align: "right" as const, computed: true, category: "education",
        formula: "指導完了数 / 契約指導回数",
        render: (c) => { const v = calcSessionProgress(c); return v !== null ? formatPercent(v) : "-"; } },
      { key: "progress_status", label: "進捗", width: 50, align: "center" as const, computed: true, category: "education",
        formula: "日程消化率 / 指導消化率 で判定",
        render: (c) => {
          const s = calcProgressStatus(c);
          const color = s === "順調" ? "text-green-400" : s === "遅延" ? "text-red-400" : "text-gray-500";
          return <span className={`text-xs ${color}`}>{s}</span>;
        } },
      { key: "level_fermi", label: "フェルミ", width: 60, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.level_fermi || "-"}</span> },
      { key: "level_case", label: "ケース", width: 60, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.level_case || "-"}</span> },
      { key: "level_mck", label: "McK", width: 60, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.level_mck || "-"}</span> },
      { key: "progress_text", label: "進捗テキスト", width: 130, category: "education",
        render: (c) => <Truncated value={c.learning?.progress_text} width={130} /> },
      { key: "selection_status", label: "選考状況", width: 110, category: "education",
        render: (c) => <Truncated value={c.learning?.selection_status} width={110} /> },
      { key: "level_up_range", label: "レベルアップ幅", width: 100, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.level_up_range || "-"}</span> },
      { key: "initial_coaching_level", label: "指導開始時レベル", width: 110, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.initial_coaching_level || "-"}</span> },
      { key: "enrollment_form_date", label: "入会フォーム日", width: 78, category: "education",
        render: (c) => <span className="text-xs">{fmtDate(c.learning?.enrollment_form_date)}</span> },
      { key: "coaching_requests", label: "指導要望", width: 130, category: "education",
        render: (c) => <Truncated value={c.learning?.coaching_requests} width={130} /> },
      { key: "enrollment_reason", label: "入会理由", width: 130, category: "education",
        render: (c) => <Truncated value={c.learning?.enrollment_reason} width={130} /> },
      { key: "behavior_session1", label: "ビヘイビア1", width: 100, category: "education",
        render: (c) => <Truncated value={c.learning?.behavior_session1} width={100} /> },
      { key: "behavior_session2", label: "ビヘイビア2", width: 100, category: "education",
        render: (c) => <Truncated value={c.learning?.behavior_session2} width={100} /> },
      { key: "assessment_session1", label: "アセスメント1", width: 110, category: "education",
        render: (c) => <Truncated value={c.learning?.assessment_session1} width={110} /> },
      { key: "assessment_session2", label: "アセスメント2", width: 110, category: "education",
        render: (c) => <Truncated value={c.learning?.assessment_session2} width={110} /> },
      { key: "case_interview_progress", label: "ケース面接進捗", width: 140, category: "education",
        render: (c) => <Truncated value={c.learning?.case_interview_progress} width={140} /> },
      { key: "case_interview_weaknesses", label: "ケース面接苦手", width: 120, category: "education",
        render: (c) => <Truncated value={c.learning?.case_interview_weaknesses} width={120} /> },
      { key: "interview_timing_at_end", label: "面接予定(終了時)", width: 120, category: "education",
        render: (c) => <Truncated value={c.learning?.interview_timing_at_end} width={120} /> },
      { key: "target_companies_at_end", label: "受験企業(終了時)", width: 120, category: "education",
        render: (c) => <Truncated value={c.learning?.target_companies_at_end} width={120} /> },
      { key: "offer_probability_at_end", label: "内定確度判定", width: 90, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.offer_probability_at_end || "-"}</span> },
      { key: "additional_coaching_proposal", label: "追加指導提案", width: 120, category: "education",
        render: (c) => <Truncated value={c.learning?.additional_coaching_proposal} width={120} /> },
      { key: "mentoring_satisfaction", label: "メンタリング満足度", width: 110, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.mentoring_satisfaction || "-"}</span> },
      { key: "start_email_sent", label: "開始メール送付", width: 100, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.start_email_sent || "-"}</span> },

      // ═══ その他基本情報 ═══
      { key: "payment_date", label: "入金日", width: 78, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.contract?.payment_date)}</span>,
        sortValue: (c) => c.contract?.payment_date || "" },
      { key: "progress_sheet", label: "Progress Sheet", width: 100,
        render: (c) => c.contract?.progress_sheet_url
          ? <a href={c.contract.progress_sheet_url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline text-xs">リンク</a>
          : "-" },
      { key: "extension_days", label: "延長(日)", width: 70, align: "right" as const, category: "education",
        render: (c) => c.learning?.extension_days != null ? `${c.learning.extension_days}` : "-" },
      { key: "additional_notes", label: "[追加]学び", width: 110, category: "sales",
        render: (c) => <Truncated value={c.pipeline?.additional_notes} width={110} /> },
      { key: "general_memo", label: "メモ", width: 140,
        render: (c) => <Truncated value={c.agent?.general_memo} width={140} /> },
      { key: "university", label: "大学名", width: 110,
        render: (c) => <span className="text-xs">{c.university || "-"}</span>, sortValue: (c) => c.university || "" },
      { key: "target_companies", label: "志望企業", width: 140,
        render: (c) => <Truncated value={c.target_companies} width={140} /> },
      { key: "target_firm_type", label: "対策ファーム", width: 100,
        render: (c) => <span className="text-xs">{c.target_firm_type || "-"}</span> },
      { key: "initial_level", label: "申込時レベル", width: 90,
        render: (c) => <span className="text-xs">{c.initial_level || "-"}</span> },
      { key: "transfer_intent", label: "転職意向", width: 80,
        render: (c) => <span className="text-xs">{c.transfer_intent || "-"}</span> },
      { key: "billing_status", label: "請求状況", width: 80, category: "sales",
        render: (c) => <span className="text-xs">{c.contract?.billing_status || "-"}</span> },
      { key: "invoice_info", label: "請求書用", width: 110,
        render: (c) => <Truncated value={c.contract?.invoice_info} width={110} /> },
      { key: "notes", label: "備考", width: 160,
        render: (c) => <Truncated value={c.notes} width={160} /> },
      { key: "caution_notes", label: "注意事項", width: 120,
        render: (c) => <Truncated value={c.caution_notes} width={120} /> },
    ],
    [attributionMap]
  );

  // タブに応じたカラムフィルタリング
  const spreadsheetColumns = useMemo(() => {
    const allowedKeys = VIEW_COLUMNS[activeTab];
    if (!allowedKeys) return allColumns;
    return allowedKeys.map((key) => allColumns.find((col) => col.key === key)).filter(Boolean) as SpreadsheetColumn<CustomerWithRelations>[];
  }, [allColumns, activeTab]);

  return (
    <div className="p-4 space-y-2">
      {/* ヘッダー: タイトル + フィルタ */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-bold text-white shrink-0">顧客一覧</h1>
        <span className="text-xs text-gray-500 shrink-0">{baseFiltered.length}件</span>

        {/* 属性フィルタ */}
        <div className="flex gap-0.5 bg-surface-elevated rounded-md p-0.5 border border-white/10">
          {["", "既卒", "新卒"].map((val) => (
            <button
              key={val}
              onClick={() => setAttributeFilter(val)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                attributeFilter === val
                  ? "bg-brand text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {val || "全属性"}
            </button>
          ))}
        </div>

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

        {/* カテゴリ凡例 */}
        <div className="flex items-center gap-2 ml-3 pl-3 border-l border-white/10">
          <span className="flex items-center gap-1 text-[10px] text-orange-400/70"><span className="w-2 h-2 rounded-sm bg-orange-500/30" />マーケ</span>
          <span className="flex items-center gap-1 text-[10px] text-blue-400/70"><span className="w-2 h-2 rounded-sm bg-blue-500/30" />営業</span>
          <span className="flex items-center gap-1 text-[10px] text-green-400/70"><span className="w-2 h-2 rounded-sm bg-green-500/30" />エデュ</span>
          <span className="flex items-center gap-1 text-[10px] text-purple-400/70"><span className="w-2 h-2 rounded-sm bg-purple-500/30" />人材</span>
        </div>
      </div>

      {/* テーブル */}
      <SpreadsheetTable
        columns={spreadsheetColumns}
        data={baseFiltered}
        getRowKey={(c) => c.id}
        storageKey={`customers-${activeTab}`}
        searchPlaceholder="名前・大学・経歴・チャネルで検索..."
        searchFilter={(c, q) =>
          c.name.toLowerCase().includes(q) ||
          (c.university?.toLowerCase().includes(q) ?? false) ||
          (c.career_history?.toLowerCase().includes(q) ?? false) ||
          (attributionMap[c.id]?.marketing_channel?.toLowerCase().includes(q) ?? false)
        }
      />
    </div>
  );
}
