"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  calcExpectedLTV,
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
type ViewTab = "all" | "marketing" | "sales" | "education" | "agent" | "subsidy";

const VIEW_TABS: { key: ViewTab; label: string }[] = [
  { key: "all", label: "全般" },
  { key: "marketing", label: "マーケ" },
  { key: "sales", label: "営業" },
  { key: "education", label: "エデュ" },
  { key: "agent", label: "エージェント" },
  { key: "subsidy", label: "補助金" },
];

// タブごとに表示するカラムキーの定義
const VIEW_COLUMNS: Record<ViewTab, string[] | null> = {
  all: null, // 全カラム表示
  marketing: [
    "application_date", "name", "attribute", "stage", "deal_status",
    "rev_total",
    "marketing_channel", "initial_channel", "application_reason",
    "sales_route", "comparison_services",
    "utm_source", "utm_medium", "utm_id", "utm_campaign",
  ],
  sales: [
    "application_date", "name", "attribute", "stage", "deal_status",
    "confirmed_amount", "rev_agent", "rev_total", "projected_amount",
    "probability", "sales_date", "response_date",
    "first_amount", "discount",
    "sales_person", "sales_content", "sales_strategy",
    "decision_factor", "application_reason",
    "agent_confirmation", "jicoo_message",
    "referral_category", "referral_status",
    "additional_sales_content", "additional_plan", "additional_discount_info",
    "alternative_application",
    "payment_date", "additional_notes",
  ],
  education: [
    "application_date", "name", "attribute", "stage", "deal_status",
    "rev_total",
    "offer_company",
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
    "extension_days",
  ],
  agent: [
    "application_date", "name", "attribute", "stage", "deal_status",
    "confirmed_amount", "rev_agent", "rev_total", "projected_amount",
    "is_agent_customer", "referral_category", "referral_status",
    "external_agents",
    "offer_rank", "offer_salary",
    "referral_fee_rate", "margin",
    "placement_confirmed", "placement_date",
    "agent_staff", "agent_memo", "loss_reason",
    "subsidy_eligible",
    "subsidy_period_eligible",
  ],
  subsidy: [
    "application_date", "name", "attribute", "stage", "deal_status",
    "confirmed_amount", "rev_total",
    "plan_name", "enrollment_status",
    "sales_date", "meeting_conducted",
    "subsidy_eligible", "subsidy_period_eligible",
    "referral_category",
  ],
};

const CLOSED_STAGES = new Set(["成約", "入金済", "追加指導", "その他購入", "動画講座購入", "成約(追加指導経由)", "途中解約(成約)"]);

type DisplayLimit = 200 | 400 | 1000 | "all";

export function CustomersClient({ customers, attributionMap }: CustomersClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialSearch = searchParams.get("search") || "";
  const [attributeFilter, setAttributeFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [contractFilter, setContractFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ViewTab>("all");
  const [displayLimit, setDisplayLimit] = useState<DisplayLimit>(200);
  const [subsidyFilter, setSubsidyFilter] = useState<string>("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [isSearching, setIsSearching] = useState(!!initialSearch);

  const handleCreate = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreating(true);
    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      attribute: form.get("attribute"),
      application_date: form.get("application_date"),
      stage: form.get("stage"),
    };
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const { id } = await res.json();
        setShowCreateModal(false);
        router.push(`/customers/${id}`);
      } else {
        const err = await res.json();
        alert(err.error || "作成に失敗しました");
      }
    } finally {
      setCreating(false);
    }
  }, [router]);

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
    if (contractFilter === "成約済み") {
      result = result.filter((c) => CLOSED_STAGES.has(c.pipeline?.stage || ""));
    } else if (contractFilter === "未成約") {
      result = result.filter((c) => !CLOSED_STAGES.has(c.pipeline?.stage || ""));
    }
    // 補助金フィルタ
    if (subsidyFilter === "subsidy") {
      result = result.filter((c) => c.contract?.subsidy_eligible);
    } else if (subsidyFilter === "period") {
      result = result.filter((c) => c.contract?.subsidy_period_eligible);
    }
    return result;
  }, [customers, attributeFilter, stageFilter, contractFilter, subsidyFilter]);

  const displayFiltered = useMemo(() => {
    if (isSearching || displayLimit === "all") return baseFiltered;
    return baseFiltered.slice(0, displayLimit);
  }, [baseFiltered, displayLimit, isSearching]);

  // ================================================================
  // 全カラム定義（並び順が表示順）
  // ================================================================
  const allColumns: SpreadsheetColumn<CustomerWithRelations>[] = useMemo(
    () => [
      // ─── 編集ボタン ───
      { key: "_edit", label: "", width: 32, stickyLeft: 0,
        render: (c) => (
          <Link href={`/customers/${c.id}?edit=true`} className="text-gray-500 hover:text-brand transition-colors" title="編集">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </Link>
        ) },

      // ─── 申込日 ───
      { key: "application_date", label: "申込日", width: 78, stickyLeft: 32,
        render: (c) => <span className="text-gray-400 text-xs">{fmtDate(c.application_date)}</span>,
        sortValue: (c) => c.application_date || "" },

      // ─── 名前 [sticky] ───
      { key: "name", label: "名前", width: 120, stickyLeft: 110,
        render: (c) => (
          <Link href={`/customers/${c.id}`} className="text-brand hover:underline text-sm">{c.name}</Link>
        ), sortValue: (c) => c.name },

      // ─── 属性 ───
      { key: "attribute", label: "属性", width: 56, category: "base",
        render: (c) => (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getAttributeColor(c.attribute)}`}>{c.attribute.includes("既卒") ? "既卒" : "新卒"}</span>
        ), sortValue: (c) => c.attribute },

      // ─── 経歴（属性の右横） ───
      { key: "career_history", label: "経歴", width: 220, multiline: true,
        render: (c) => c.career_history || "-" },

      // ─── 人材紹介利用 ───
      { key: "is_agent_customer", label: "人材", width: 40, align: "center" as const,
        render: (c) => isAgentCustomer(c)
          ? <span className="text-purple-400 text-sm">&#9745;</span>
          : <span className="text-gray-600 text-sm">&#9744;</span>,
        sortValue: (c) => isAgentCustomer(c) ? 1 : 0 },

      // ─── 検討状況 ───
      { key: "stage", label: "検討状況", width: 85, category: "sales",
        render: (c) => c.pipeline ? (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStageColor(c.pipeline.stage)}`}>{c.pipeline.stage}</span>
        ) : "-", sortValue: (c) => c.pipeline?.stage || "" },

      // ─── 実施状況（検討状況の横） ───
      { key: "deal_status", label: "実施状況", width: 80, category: "sales",
        render: (c) => c.pipeline ? (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getDealStatusColor(c.pipeline.deal_status)}`}>{c.pipeline.deal_status}</span>
        ) : "-", sortValue: (c) => c.pipeline?.deal_status || "" },

      // ═══ 売上4種（近接配置） ═══
      { key: "confirmed_amount", label: "確定売上", width: 100, align: "right" as const, category: "sales",
        render: (c) => c.contract?.confirmed_amount ? formatCurrency(c.contract.confirmed_amount) : "-",
        sortValue: (c) => c.contract?.confirmed_amount || 0 },

      { key: "rev_agent", label: "人材見込売上", width: 110, align: "right" as const, computed: true, category: "sales",
        formula: "想定年収 × 入社至る率 × 内定確度 × 紹介料率 × マージン",
        render: (c) => {
          if (!isAgentCustomer(c)) return "-";
          const v = calcExpectedReferralFee(c);
          return v > 0 ? formatCurrency(v) : "-";
        }, sortValue: (c) => isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0 },

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

      { key: "projected_amount", label: "見込LTV", width: 100, align: "right" as const, computed: true, category: "sales",
        formula: "成約者: 確定売上+人材売上+補助金\n未成約者: 見込み成約率×見込み単価",
        render: (c) => {
          const v = calcExpectedLTV(c);
          return v > 0 ? formatCurrency(v) : "-";
        }, sortValue: (c) => calcExpectedLTV(c) },

      // ═══ マーケティング（オレンジ） ═══
      { key: "marketing_channel", label: "帰属チャネル", width: 110, category: "marketing",
        render: (c) => {
          const attr = attributionMap[c.id];
          return attr ? <span className="text-white font-medium text-xs">{attr.marketing_channel}</span> : <span className="text-gray-600 text-xs">-</span>;
        }, sortValue: (c) => attributionMap[c.id]?.marketing_channel || "" },
      { key: "initial_channel", label: "初回認知経路", width: 110, category: "marketing",
        render: (c) => <span className="text-xs">{c.pipeline?.initial_channel || "-"}</span> },
      { key: "application_reason", label: "申し込みの決め手", width: 160, category: "marketing", multiline: true,
        render: (c) => c.application_reason || "-" },
      { key: "sales_route", label: "経路(営業)", width: 100, category: "marketing",
        render: (c) => <span className="text-xs">{c.pipeline?.sales_route || c.pipeline?.route_by_sales || "-"}</span> },
      { key: "comparison_services", label: "比較サービス", width: 140, category: "marketing", multiline: true,
        render: (c) => c.pipeline?.comparison_services || "-" },
      { key: "utm_source", label: "utm_source", width: 90, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_source || "-"}</span>, sortValue: (c) => c.utm_source || "" },
      { key: "utm_medium", label: "utm_medium", width: 90, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_medium || "-"}</span> },
      { key: "utm_id", label: "utm_id", width: 70, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_id || "-"}</span> },
      { key: "utm_campaign", label: "utm_campaign", width: 100, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_campaign || "-"}</span> },

      // ═══ 営業（青） ═══
      { key: "agent_interest", label: "申込時エージェント", width: 120, category: "sales",
        render: (c) => <span className="text-xs">{c.pipeline?.agent_interest_at_application || "-"}</span>,
        sortValue: (c) => String(c.pipeline?.agent_interest_at_application || "") },

      { key: "meeting_scheduled", label: "面接予定", width: 78, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.pipeline?.meeting_scheduled_date)}</span>,
        sortValue: (c) => c.pipeline?.meeting_scheduled_date || "" },

      { key: "decision_factor", label: "申込の決め手", width: 160, category: "sales", multiline: true,
        render: (c) => c.pipeline?.decision_factor || "-" },

      { key: "sales_date", label: "営業日", width: 78, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.pipeline?.sales_date)}</span>,
        sortValue: (c) => c.pipeline?.sales_date || "" },

      { key: "meeting_conducted", label: "面談実施日", width: 78, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.pipeline?.meeting_conducted_date)}</span>,
        sortValue: (c) => c.pipeline?.meeting_conducted_date || "" },

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

      { key: "jicoo_message", label: "jicooメッセージ", width: 160, category: "sales", multiline: true,
        render: (c) => c.pipeline?.jicoo_message || "-" },

      { key: "agent_confirmation", label: "エージェント利用意向", width: 120, category: "sales",
        render: (c) => <span className="text-xs">{c.pipeline?.agent_confirmation || "-"}</span> },

      { key: "first_amount", label: "一次報酬額", width: 100, align: "right" as const, category: "sales",
        render: (c) => c.contract?.first_amount ? formatCurrency(c.contract.first_amount) : "-",
        sortValue: (c) => c.contract?.first_amount || 0 },

      { key: "discount", label: "割引", width: 70, align: "right" as const, category: "sales",
        render: (c) => c.contract?.discount ? formatCurrency(c.contract.discount) : "-" },

      { key: "alternative_application", label: "別経由応募", width: 90, category: "sales",
        render: (c) => <span className="text-xs">{c.pipeline?.alternative_application || "-"}</span> },

      { key: "payment_date", label: "入金日", width: 78, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.contract?.payment_date)}</span>,
        sortValue: (c) => c.contract?.payment_date || "" },
      { key: "additional_notes", label: "[追加]学び", width: 140, category: "sales", multiline: true,
        render: (c) => c.pipeline?.additional_notes || "-" },

      // ─── 追加指導（営業） ───
      { key: "additional_sales_content", label: "[追加]営業内容", width: 160, category: "sales", multiline: true,
        render: (c) => c.pipeline?.additional_sales_content || "-" },
      { key: "additional_plan", label: "[追加]プラン", width: 110, category: "sales",
        render: (c) => <span className="text-xs">{c.pipeline?.additional_plan || "-"}</span> },
      { key: "additional_discount_info", label: "[追加]割引案内", width: 130, category: "sales", multiline: true,
        render: (c) => c.pipeline?.additional_discount_info || "-" },

      // ═══ 人材紹介（紫） ═══
      { key: "referral_category", label: "人材紹介区分", width: 100, category: "agent",
        render: (c) => <span className="text-xs">{c.contract?.referral_category || "-"}</span> },
      { key: "referral_status", label: "紹介ステータス", width: 100, category: "agent",
        render: (c) => <span className="text-xs">{c.contract?.referral_status || "-"}</span> },

      { key: "external_agents", label: "利用エージェント", width: 110, category: "agent",
        render: (c) => <span className="text-xs">{c.agent?.external_agents || "-"}</span> },
      { key: "offer_rank", label: "内定ランク", width: 90, category: "agent",
        render: (c) => {
          const rank = c.agent?.offer_rank || "-";
          if (rank === "-") return "-";
          return <span className="text-xs font-bold">{rank}</span>;
        },
        sortValue: (c) => ({ S: 5, A: 4, B: 3, C: 2, D: 1 }[c.agent?.offer_rank || "B"] || 0) },
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
      { key: "loss_reason", label: "失注理由", width: 140, category: "agent", multiline: true,
        render: (c) => c.agent?.loss_reason || "-" },
      { key: "subsidy_eligible", label: "補助金対象", width: 80, category: "agent",
        render: (c) => c.contract?.subsidy_eligible ? <span className="text-purple-400 text-xs">対象</span> : "-" },
      { key: "subsidy_period_eligible", label: "補助金期間対象", width: 100, category: "agent",
        render: (c) => c.contract?.subsidy_period_eligible ? <span className="text-emerald-400 text-xs">対象</span> : "-" },

      // ═══ エデュケーション（緑） ═══
      { key: "offer_company", label: "内定先", width: 120, category: "education",
        render: (c) => <span className="text-xs">{c.agent?.offer_company || "-"}</span> },
      { key: "enrollment_status", label: "受講状況", width: 90, category: "education",
        render: (c) => <span className="text-xs">{c.contract?.enrollment_status || "-"}</span> },
      { key: "plan_name", label: "プラン名", width: 150, category: "education", multiline: true,
        render: (c) => c.contract?.plan_name || "-" },
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
      { key: "progress_text", label: "進捗テキスト", width: 160, category: "education", multiline: true,
        render: (c) => c.learning?.progress_text || "-" },
      { key: "selection_status", label: "選考状況", width: 140, category: "education", multiline: true,
        render: (c) => c.learning?.selection_status || "-" },
      { key: "level_up_range", label: "レベルアップ幅", width: 100, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.level_up_range || "-"}</span> },
      { key: "initial_coaching_level", label: "指導開始時レベル", width: 110, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.initial_coaching_level || "-"}</span> },
      { key: "enrollment_form_date", label: "入会フォーム日", width: 78, category: "education",
        render: (c) => <span className="text-xs">{fmtDate(c.learning?.enrollment_form_date)}</span> },
      { key: "coaching_requests", label: "指導要望", width: 160, category: "education", multiline: true,
        render: (c) => c.learning?.coaching_requests || "-" },
      { key: "enrollment_reason", label: "入会理由", width: 160, category: "education", multiline: true,
        render: (c) => c.learning?.enrollment_reason || "-" },
      { key: "behavior_session1", label: "ビヘイビア1", width: 120, category: "education", multiline: true,
        render: (c) => c.learning?.behavior_session1 || "-" },
      { key: "behavior_session2", label: "ビヘイビア2", width: 120, category: "education", multiline: true,
        render: (c) => c.learning?.behavior_session2 || "-" },
      { key: "assessment_session1", label: "アセスメント1", width: 130, category: "education", multiline: true,
        render: (c) => c.learning?.assessment_session1 || "-" },
      { key: "assessment_session2", label: "アセスメント2", width: 130, category: "education", multiline: true,
        render: (c) => c.learning?.assessment_session2 || "-" },
      { key: "case_interview_progress", label: "ケース面接進捗", width: 160, category: "education", multiline: true,
        render: (c) => c.learning?.case_interview_progress || "-" },
      { key: "case_interview_weaknesses", label: "ケース面接苦手", width: 140, category: "education", multiline: true,
        render: (c) => c.learning?.case_interview_weaknesses || "-" },
      { key: "interview_timing_at_end", label: "面接予定(終了時)", width: 140, category: "education", multiline: true,
        render: (c) => c.learning?.interview_timing_at_end || "-" },
      { key: "target_companies_at_end", label: "受験企業(終了時)", width: 140, category: "education", multiline: true,
        render: (c) => c.learning?.target_companies_at_end || "-" },
      { key: "offer_probability_at_end", label: "内定確度判定", width: 90, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.offer_probability_at_end || "-"}</span> },
      { key: "additional_coaching_proposal", label: "追加指導提案", width: 140, category: "education", multiline: true,
        render: (c) => c.learning?.additional_coaching_proposal || "-" },
      { key: "mentoring_satisfaction", label: "メンタリング満足度", width: 110, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.mentoring_satisfaction || "-"}</span> },
      { key: "start_email_sent", label: "開始メール送付", width: 100, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.start_email_sent || "-"}</span> },
      { key: "extension_days", label: "延長(日)", width: 70, align: "right" as const, category: "education",
        render: (c) => c.learning?.extension_days != null ? `${c.learning.extension_days}` : "-" },

      // ═══ その他基本情報 ═══
      { key: "university", label: "大学名", width: 110,
        render: (c) => <span className="text-xs">{c.university || "-"}</span>, sortValue: (c) => c.university || "" },
      { key: "target_companies", label: "志望企業", width: 160, multiline: true,
        render: (c) => c.target_companies || "-" },
      { key: "target_firm_type", label: "対策ファーム", width: 100,
        render: (c) => <span className="text-xs">{c.target_firm_type || "-"}</span> },
      { key: "initial_level", label: "申込時レベル", width: 90,
        render: (c) => <span className="text-xs">{c.initial_level || "-"}</span> },
      { key: "transfer_intent", label: "転職意向", width: 80,
        render: (c) => <span className="text-xs">{c.transfer_intent || "-"}</span> },
      { key: "progress_sheet", label: "Progress Sheet", width: 100,
        render: (c) => c.contract?.progress_sheet_url
          ? <a href={c.contract.progress_sheet_url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline text-xs">リンク</a>
          : "-" },
      { key: "general_memo", label: "メモ", width: 160, multiline: true,
        render: (c) => c.agent?.general_memo || "-" },
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
        <span className="text-xs text-gray-500 shrink-0">
          {displayLimit !== "all" && displayFiltered.length < baseFiltered.length
            ? `${displayFiltered.length}/${baseFiltered.length}件`
            : `${baseFiltered.length}件`}
        </span>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-md hover:bg-brand/90 transition-colors shrink-0"
        >
          + 新規登録
        </button>

        {/* 表示件数セレクタ */}
        <select
          value={String(displayLimit)}
          onChange={(e) => setDisplayLimit(e.target.value === "all" ? "all" : Number(e.target.value) as 200 | 400 | 1000)}
          className="px-2 py-1 bg-surface-elevated border border-white/10 text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="200">200件</option>
          <option value="400">400件</option>
          <option value="1000">1000件</option>
          <option value="all">全件</option>
        </select>

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

        {/* 成約/未成約フィルタ */}
        <div className="flex gap-0.5 bg-surface-elevated rounded-md p-0.5 border border-white/10">
          {["", "成約済み", "未成約"].map((val) => (
            <button
              key={val}
              onClick={() => setContractFilter(val)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                contractFilter === val
                  ? "bg-brand text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {val || "全件"}
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
            onClick={() => { setActiveTab(tab.key); if (tab.key === "subsidy" && !subsidyFilter) setSubsidyFilter("subsidy"); }}
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

      {/* 補助金フィルタ（補助金タブ時のみ表示） */}
      {activeTab === "subsidy" && (
        <div className="flex gap-0.5 bg-surface-elevated rounded-md p-0.5 w-fit border border-white/10">
          {[
            { val: "subsidy", label: "補助金対象" },
            { val: "period", label: "補助金期間対象" },
          ].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setSubsidyFilter(val)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                subsidyFilter === val
                  ? "bg-purple-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* テーブル */}
      <SpreadsheetTable
        columns={spreadsheetColumns}
        data={displayFiltered}
        getRowKey={(c) => c.id}
        storageKey={`customers-${activeTab}`}
        searchPlaceholder="名前・メール・大学・経歴・チャネルで検索..."
        initialSearch={initialSearch}
        onSearchChange={(q) => setIsSearching(q.length > 0)}
        searchFilter={(c, q) =>
          c.name.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false) ||
          (c.university?.toLowerCase().includes(q) ?? false) ||
          (c.career_history?.toLowerCase().includes(q) ?? false) ||
          (attributionMap[c.id]?.marketing_channel?.toLowerCase().includes(q) ?? false)
        }
      />

      {/* 新規登録モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCreateModal(false)}>
          <div className="bg-surface-card border border-white/10 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">新規顧客登録</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">名前 *</label>
                <input name="name" required className="w-full px-3 py-2 bg-surface border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">メールアドレス</label>
                <input name="email" type="email" className="w-full px-3 py-2 bg-surface border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">電話番号</label>
                <input name="phone" className="w-full px-3 py-2 bg-surface border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">属性 *</label>
                  <select name="attribute" required className="w-full px-3 py-2 bg-surface border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand">
                    <option value="既卒">既卒</option>
                    <option value="既卒・中途(3年目未満)">既卒・中途(3年目未満)</option>
                    <option value="既卒・中途(3年目以上)">既卒・中途(3年目以上)</option>
                    <option value="新卒">新卒</option>
                    <option value="新卒(26卒)">新卒(26卒)</option>
                    <option value="新卒(27卒)">新卒(27卒)</option>
                    <option value="新卒(28卒)">新卒(28卒)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">ステージ</label>
                  <select name="stage" className="w-full px-3 py-2 bg-surface border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand">
                    <option value="問い合わせ">問い合わせ</option>
                    <option value="未実施">未実施</option>
                    <option value="日程確定">日程確定</option>
                    <option value="検討中">検討中</option>
                    <option value="成約">成約</option>
                    <option value="実施不可">実施不可</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">申込日</label>
                <input name="application_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full px-3 py-2 bg-surface border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                  キャンセル
                </button>
                <button type="submit" disabled={creating} className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50">
                  {creating ? "登録中..." : "登録"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
