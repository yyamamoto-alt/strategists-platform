"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  formatCurrency,
  formatPercent,
  getStageColor,
  getAttributeColor,
  getChannelColor,
  getPlanColor,
  getSalesPersonColor,
  getProbabilityColor,
  getReferralCategoryColor,
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
  isShinsotsu,
  getSubsidyAmount,
  getSchoolRevenue,
  AGENT_CATEGORIES,
  OFFER_RANK_META,
} from "@/lib/calc-fields";
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from "@/components/spreadsheet-table";





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
type ViewTab = "overview" | "all" | "marketing" | "sales" | "education" | "agent" | "schedule_unconfirmed";

const VIEW_TABS: { key: ViewTab; label: string }[] = [
  { key: "overview", label: "概要" },
  { key: "all", label: "全般" },
  { key: "marketing", label: "マーケ" },
  { key: "sales", label: "営業" },
  { key: "education", label: "エデュ" },
  { key: "agent", label: "エージェント" },
  { key: "schedule_unconfirmed", label: "架電用" },
];

// タブごとに表示するカラムキーの定義
const VIEW_COLUMNS: Record<ViewTab, string[] | null> = {
  overview: [
    // 基本
    "application_date", "name", "attribute", "stage",
    // 営業日程（検討状況のすぐ右）
    "meeting_scheduled", "additional_coaching_date", "response_deadline",
    // マーケ帰属
    "marketing_channel", "initial_channel_base", "application_reason_base", "utm_source_base", "sales_route_base",
    "subsidy_eligible",
    "career_history",
    // 売上（見込含む = 確定 + 人材見込 + 見込みLTV）
    "rev_total", "rev_eq", "confirmed_amount", "rev_plus", "rev_agent", "expected_ltv",
    // プラン名
    "plan_name",
    // （sales_routeは上のマーケ帰属に統合）
    // 営業: 角度, 営業担当
    "probability", "sales_person",
    // 人材紹介
    "referral_category", "external_agents",
  ],
  all: null, // 全カラム表示
  marketing: [
    "application_date", "name", "attribute", "stage", "subsidy_eligible",
    "rev_total", "confirmed_amount", "rev_agent", "expected_ltv",
    "marketing_channel", "initial_channel", "application_reason",
    "sales_route", "comparison_services",
    "utm_source", "utm_medium", "utm_id", "utm_campaign",
  ],
  sales: [
    "application_date", "name", "attribute", "stage", "subsidy_eligible",
    "confirmed_amount", "rev_plus", "rev_agent", "rev_eq", "rev_total", "expected_ltv",
    "meeting_scheduled", "probability", "sales_date", "additional_coaching_date", "response_deadline",
    "first_amount", "discount",
    "sales_person", "sales_content", "sales_strategy",
    "decision_factor", "application_reason",
    "agent_confirmation", "jicoo_message",
    "referral_category",
    "additional_sales_content", "additional_plan", "additional_discount_info",
    "alternative_application",
    "payment_date", "additional_notes",
  ],
  education: [
    "application_date", "name", "attribute", "stage", "subsidy_eligible",
    "rev_total", "confirmed_amount", "rev_agent", "expected_ltv",
    "offer_company",
    "enrollment_status", "plan_name", "mentor_name",
    "coaching_start", "coaching_end", "last_coaching",
    "contract_months", "total_sessions", "completed_sessions",
    "remaining_sessions", "weekly_sessions",
    "attendance_rate", "session_completion_rate", "progress_status",
    "level_fermi", "level_case", "level_mck",
    "progress_text", "selection_status", "level_up_range",
    "initial_coaching_level",
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
    "application_date", "name", "attribute", "stage",
    "referral_category", "job_search_status", "offer_rank", "ai_offer_probability", "placement_confirmed",
    "confirmed_amount", "rev_plus", "rev_agent", "rev_eq", "rev_total", "expected_ltv",
    "external_agents", "offer_salary",
    "referral_fee_rate", "margin",
    "placement_date",
    "agent_staff", "agent_memo", "loss_reason",
  ],
  schedule_unconfirmed: [
    "application_date", "name",
    // 重要: 名前の次に志望先・属性・電話・メアド
    "target_firm_type", "attribute", "phone", "email",
    "stage", "call_memo",
    "meeting_scheduled", "sales_person", "additional_coaching_date", "response_deadline",
    "marketing_channel", "initial_channel_base", "application_reason_base", "utm_source_base", "sales_route_base",
    "subsidy_eligible",
    "career_history",
    "rev_total", "rev_eq", "confirmed_amount", "rev_plus", "rev_agent", "expected_ltv",
    "plan_name",
    "probability",
    "referral_category", "external_agents",
  ],
};

const CLOSED_STAGES = new Set(["成約"]);

const STAGE_OPTIONS = [
  { group: "未実施", options: ["日程未確", "未実施", "実施不可"] },
  { group: "アクティブ", options: ["検討中", "長期検討"] },
  { group: "成約", options: ["成約", "成約見込(未入金)"] },
  { group: "購入・追加", options: ["その他購入", "動画講座購入", "追加指導"] },
  { group: "失注", options: ["失注", "失注見込", "失注見込(自動)", "NoShow", "全額返金", "キャンセル"] },
  { group: "その他", options: ["非実施対象"] },
];

function InlineStageSelect({ customerId, currentStage, onUpdate }: { customerId: string; currentStage: string; onUpdate: (id: string, newStage: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`px-2 py-px rounded-full text-[10px] leading-none font-medium cursor-pointer hover:ring-1 hover:ring-brand/50 ${getStageColor(currentStage)}`}
      >
        {currentStage}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-surface-elevated border border-white/10 rounded-lg shadow-xl py-1 w-44 max-h-64 overflow-y-auto">
          {STAGE_OPTIONS.map((group) => (
            <div key={group.group}>
              <div className="px-2 py-1 text-[9px] text-gray-500 uppercase tracking-wider">{group.group}</div>
              {group.options.map((opt) => (
                <button
                  key={opt}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (opt !== currentStage) onUpdate(customerId, opt);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1 text-xs hover:bg-white/10 ${opt === currentStage ? "text-brand font-medium" : "text-gray-300"}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineTextArea({ customerId, value, onSave }: { customerId: string; value: string | null | undefined; onSave: (id: string, val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || "");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.selectionStart = ref.current.value.length;
    }
  }, [editing]);

  const save = () => {
    setEditing(false);
    if (text !== (value || "")) onSave(customerId, text);
  };

  if (!editing) {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); setEditing(true); setText(value || ""); }}
        className="cursor-text min-h-[24px] w-full text-xs text-gray-300 hover:bg-white/5 rounded px-1 py-0.5 whitespace-pre-wrap break-words"
        title="クリックで編集"
      >
        {value || <span className="text-gray-600">メモを入力...</span>}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setEditing(false); setText(value || ""); }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full min-h-[60px] px-1 py-0.5 bg-surface border border-brand/50 rounded text-xs text-white resize-y focus:outline-none focus:ring-1 focus:ring-brand"
      placeholder="架電メモを入力... (Cmd+Enter or フォーカス外で保存)"
    />
  );
}

export function CustomersClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialSearch = searchParams.get("search") || "";
  const [customers, setCustomers] = useState<CustomerWithRelations[]>([]);
  const [attributionMap, setAttributionMap] = useState<Record<string, ChannelAttribution>>({});
  const [firstPaidMap, setFirstPaidMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [attributeFilter, setAttributeFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [contractFilter, setContractFilter] = useState<string>("");
  const [agentFilter, setAgentFilter] = useState<boolean>(searchParams.get("filter") === "agent");
  const [subsidyFilter, setSubsidyFilter] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [stageOverrides, setStageOverrides] = useState<Record<string, string>>({});
  const [subsidyOverrides, setSubsidyOverrides] = useState<Record<string, boolean>>({});
  const [agentExcludeOverrides, setAgentExcludeOverrides] = useState<Record<string, string>>({});
  const [jobStatusOverrides, setJobStatusOverrides] = useState<Record<string, string>>({});
  const [callMemoOverrides, setCallMemoOverrides] = useState<Record<string, string>>({});

  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // 段階的読み込み: 最初に100件、その後バックグラウンドで残りを取得
  useEffect(() => {
    let cancelled = false;
    // Step 1: 最初の100件を高速表示
    fetch("/api/customers?limit=100")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setCustomers(data.customers || []);
        setAttributionMap(data.attributionMap || {});
        setFirstPaidMap(data.firstPaidMap || {});
        setTotalCount(data.total || 0);
        setLoading(false);

        // Step 2: 残りをバックグラウンドで取得
        if (data.total > 100) {
          setLoadingMore(true);
          fetch("/api/customers?limit=0&offset=0")
            .then((res2) => res2.json())
            .then((fullData) => {
              if (cancelled) return;
              setCustomers(fullData.customers || []);
              setAttributionMap(fullData.attributionMap || {});
              setFirstPaidMap(fullData.firstPaidMap || {});
              setLoadingMore(false);
            })
            .catch(() => { if (!cancelled) setLoadingMore(false); });
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);


  const handleStageUpdate = useCallback(async (customerId: string, newStage: string) => {
    setStageOverrides((prev) => ({ ...prev, [customerId]: newStage }));
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline: { stage: newStage } }),
      });
      if (!res.ok) {
        setStageOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
        alert("ステージ更新に失敗しました");
      }
    } catch {
      setStageOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
      alert("ステージ更新に失敗しました");
    }
  }, []);

  // 補助金対象トグル（対象 ⇔ 非対象）
  const handleSubsidyToggle = useCallback(async (customerId: string, currentEligible: boolean) => {
    const newVal = !currentEligible;
    setSubsidyOverrides((prev) => ({ ...prev, [customerId]: newVal }));
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract: { subsidy_eligible: newVal } }),
      });
      if (!res.ok) {
        setSubsidyOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
        alert("補助金ステータス更新に失敗しました");
      }
    } catch {
      setSubsidyOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
      alert("補助金ステータス更新に失敗しました");
    }
  }, []);

  // 人材紹介区分ドロップダウン更新
  const handleReferralCategoryChange = useCallback(async (customerId: string, value: string) => {
    const newVal = value || null;
    setAgentExcludeOverrides((prev) => ({ ...prev, [customerId]: value }));
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract: { referral_category: newVal } }),
      });
      if (!res.ok) {
        setAgentExcludeOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
        alert("人材紹介区分の更新に失敗しました");
      }
    } catch {
      setAgentExcludeOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
      alert("人材紹介区分の更新に失敗しました");
    }
  }, []);

  // 活動状況ドロップダウン更新
  const handleJobStatusChange = useCallback(async (customerId: string, value: string) => {
    const newVal = value || null;
    setJobStatusOverrides((prev) => ({ ...prev, [customerId]: value }));
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: { job_search_status: newVal } }),
      });
      if (!res.ok) {
        setJobStatusOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
        alert("活動状況の更新に失敗しました");
      }
    } catch {
      setJobStatusOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
      alert("活動状況の更新に失敗しました");
    }
  }, []);

  // 内定ランク更新
  const [offerRankOverrides, setOfferRankOverrides] = useState<Record<string, string>>({});
  const handleOfferRankChange = useCallback(async (customerId: string, value: string) => {
    const newVal = value || null;
    setOfferRankOverrides((prev) => ({ ...prev, [customerId]: value }));
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: { offer_rank: newVal } }),
      });
      if (!res.ok) {
        setOfferRankOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
        alert("内定ランクの更新に失敗しました");
      }
    } catch {
      setOfferRankOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
      alert("内定ランクの更新に失敗しました");
    }
  }, []);

  // 架電メモ保存
  const handleCallMemoSave = useCallback(async (customerId: string, memo: string) => {
    setCallMemoOverrides((prev) => ({ ...prev, [customerId]: memo }));
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline: { call_memo: memo || null } }),
      });
      if (!res.ok) {
        setCallMemoOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
        alert("架電メモ保存に失敗しました");
      }
    } catch {
      setCallMemoOverrides((prev) => { const next = { ...prev }; delete next[customerId]; return next; });
      alert("架電メモ保存に失敗しました");
    }
  }, []);

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
    if (agentFilter) {
      result = result.filter((c) => isAgentCustomer(c));
    }
    if (subsidyFilter) {
      result = result.filter((c) => {
        const eligible = subsidyOverrides[c.id] ?? c.contract?.subsidy_eligible;
        return eligible === true;
      });
    }
    return result;
  }, [customers, attributeFilter, stageFilter, contractFilter, agentFilter, subsidyFilter, subsidyOverrides]);


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
      { key: "application_date", label: "申込日", width: 70, stickyLeft: 32,
        render: (c) => <span className="text-gray-400 text-xs">{fmtDate(c.application_date)}</span>,
        sortValue: (c) => c.application_date || "" },

      // ─── 名前 [sticky] ───
      { key: "name", label: "名前", width: 100, stickyLeft: 102,
        render: (c) => (
          <Link href={`/customers/${c.id}`} className="text-brand hover:underline text-sm">{c.name}</Link>
        ), sortValue: (c) => c.name },

      // ─── 属性 ───
      { key: "attribute", label: "属性", width: 52, stickyLeft: 202, category: "base",
        render: (c) => (
          <span className={`inline-block px-2 py-px rounded-full text-[10px] leading-none font-medium whitespace-nowrap ${getAttributeColor(c.attribute)}`}>{c.attribute.includes("既卒") ? "既卒" : "新卒"}</span>
        ), sortValue: (c) => c.attribute,
        filterValue: (c) => c.attribute?.includes("既卒") ? "既卒" : "新卒" },

      // ─── 検討状況（属性の右） ───
      { key: "stage", label: "検討状況", width: 100, stickyLeft: 254, category: "base",
        render: (c) => {
          const stage = stageOverrides[c.id] || c.pipeline?.stage;
          return stage ? (
            <InlineStageSelect customerId={c.id} currentStage={stage} onUpdate={handleStageUpdate} />
          ) : "-";
        }, sortValue: (c) => stageOverrides[c.id] || c.pipeline?.stage || "",
        filterValue: (c) => stageOverrides[c.id] || c.pipeline?.stage || "" },

      // ─── 補助金対象（検討状況の右） ───
      { key: "subsidy_eligible", label: "補助金", width: 55, align: "center" as const, category: "agent",
        render: (c) => {
          const eligible = subsidyOverrides[c.id] ?? c.contract?.subsidy_eligible;
          const stage = stageOverrides[c.id] || c.pipeline?.stage;
          const isKisotsuSeiyaku = !isShinsotsu(c.attribute) && stage === "成約";
          if (eligible) {
            return <span className="text-purple-400 text-xs">対象</span>;
          }
          if (eligible === false && isKisotsuSeiyaku) {
            return <span className="text-gray-500 text-xs">非対象</span>;
          }
          // 既卒・成約で補助金未設定 → 「非対象」を設定できるボタンを表示
          if (isKisotsuSeiyaku) {
            return (
              <button
                onClick={(e) => { e.stopPropagation(); handleSubsidyToggle(c.id, false); }}
                className="text-[10px] text-gray-600 cursor-pointer hover:text-gray-400"
                title="非対象に設定"
              >設定</button>
            );
          }
          return <span className="text-gray-700 text-xs">-</span>;
        },
        filterValue: (c) => {
          const eligible = subsidyOverrides[c.id] ?? c.contract?.subsidy_eligible;
          return eligible ? "対象" : eligible === false ? "非対象" : "";
        } },

      // ─── 人材紹介区分（ドロップダウン） ───
      { key: "referral_category", label: "人材紹介区分", width: 100, category: "agent",
        render: (c) => {
          const cat = agentExcludeOverrides[c.id] !== undefined ? agentExcludeOverrides[c.id] : (c.contract?.referral_category || "");
          return (
            <select
              value={cat}
              onChange={(e) => { e.stopPropagation(); handleReferralCategoryChange(c.id, e.target.value); }}
              className="bg-transparent border border-white/10 rounded px-1 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer w-full"
            >
              <option value="">未設定</option>
              <option value="フル利用">フル利用</option>
              <option value="一部利用">一部利用</option>
              <option value="自社">自社</option>
              <option value="該当">該当</option>
              <option value="非対象">非対象</option>
              <option value="なし">なし</option>
              <option value="スクールのみ">スクールのみ</option>
            </select>
          );
        },
        sortValue: (c) => {
          const cat = agentExcludeOverrides[c.id] !== undefined ? agentExcludeOverrides[c.id] : (c.contract?.referral_category || "");
          return AGENT_CATEGORIES.has(cat) ? 1 : cat === "非対象" ? -1 : 0;
        },
        filterValue: (c) => {
          const cat = agentExcludeOverrides[c.id] !== undefined ? agentExcludeOverrides[c.id] : (c.contract?.referral_category || "");
          return cat || "未設定";
        } },

      // ─── 活動状況（ドロップダウン） ───
      { key: "job_search_status", label: "活動状況", width: 85, category: "agent",
        render: (c) => {
          if (!isAgentCustomer(c)) return <span className="text-gray-600 text-xs">-</span>;
          const status = jobStatusOverrides[c.id] !== undefined ? jobStatusOverrides[c.id] : (c.agent?.job_search_status || "");
          return (
            <select
              value={status}
              onChange={(e) => { e.stopPropagation(); handleJobStatusChange(c.id, e.target.value); }}
              className={`border border-white/10 rounded px-1 py-0.5 text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer w-full ${
                status === "活動中" ? "bg-brand/20 text-brand border-brand/30" :
                status === "活動予定" ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" :
                status === "終了" ? "bg-gray-800 text-gray-400 border-gray-700" :
                "bg-transparent text-gray-500"
              }`}
            >
              <option value="">未設定</option>
              <option value="活動中">活動中</option>
              <option value="活動予定">活動予定</option>
              <option value="終了">終了</option>
            </select>
          );
        },
        sortValue: (c) => {
          const s = jobStatusOverrides[c.id] !== undefined ? jobStatusOverrides[c.id] : (c.agent?.job_search_status || "");
          return s === "活動中" ? 2 : s === "終了" ? 1 : 0;
        },
        filterValue: (c) => {
          const s = jobStatusOverrides[c.id] !== undefined ? jobStatusOverrides[c.id] : (c.agent?.job_search_status || "");
          return s || "未設定";
        } },

      // ─── 内定ランク（インライン編集） ───
      { key: "offer_rank", label: "内定ランク", width: 70, align: "center" as const, category: "agent",
        render: (c) => {
          if (!isAgentCustomer(c)) return <span className="text-gray-600 text-xs">-</span>;
          const rank = offerRankOverrides[c.id] !== undefined ? offerRankOverrides[c.id] : (c.agent?.offer_rank || "");
          const meta = rank ? OFFER_RANK_META[rank] : null;
          return (
            <select
              value={rank}
              onChange={(e) => { e.stopPropagation(); handleOfferRankChange(c.id, e.target.value); }}
              className={`border rounded px-1 py-0.5 text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer w-full ${
                meta ? `${meta.color} ${meta.bgColor} border-white/20` : "bg-transparent text-gray-500 border-white/10"
              }`}
            >
              <option value="">-</option>
              {Object.entries(OFFER_RANK_META).map(([k, v]) => (
                <option key={k} value={k}>{k} ({v.label})</option>
              ))}
            </select>
          );
        },
        sortValue: (c) => {
          const rank = offerRankOverrides[c.id] !== undefined ? offerRankOverrides[c.id] : (c.agent?.offer_rank || "");
          const order: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };
          return order[rank] || 0;
        },
        filterValue: (c) => {
          const rank = offerRankOverrides[c.id] !== undefined ? offerRankOverrides[c.id] : (c.agent?.offer_rank || "");
          return rank || "未設定";
        } },

      // ─── AI内定確度 ───
      { key: "ai_offer_probability", label: "AI内定確度", width: 75, align: "center" as const, category: "agent",
        render: (c) => {
          if (!isAgentCustomer(c)) return <span className="text-gray-600 text-xs">-</span>;
          const prob = c.agent?.ai_offer_probability;
          if (prob == null) return <span className="text-gray-600 text-xs">-</span>;
          const color = prob >= 60 ? "text-emerald-400" : prob >= 30 ? "text-amber-400" : "text-gray-400";
          return <span className={`text-xs font-medium ${color}`}>{prob}%</span>;
        },
        sortValue: (c) => c.agent?.ai_offer_probability || 0 },

      // ─── 経歴 ───
      { key: "career_history", label: "経歴", width: 500,
        render: (c) => <Truncated value={c.career_history} width={500} /> },

      // ═══ 売上（計算式表示） ═══
      { key: "confirmed_amount", label: "確定売上", width: 90, align: "right" as const, category: "sales",
        render: (c) => {
          const subsidyOk = subsidyOverrides[c.id] ?? c.contract?.subsidy_eligible;
          const amt = getSchoolRevenue(c) + (subsidyOk ? getSubsidyAmount(c) : 0);
          return amt > 0 ? <span className="text-xs">{formatCurrency(amt)}</span> : "-";
        },
        sortValue: (c) => {
          const subsidyOk = subsidyOverrides[c.id] ?? c.contract?.subsidy_eligible;
          return getSchoolRevenue(c) + (subsidyOk ? getSubsidyAmount(c) : 0);
        } },

      { key: "rev_plus", label: "+", width: 16, align: "center" as const, category: "sales",
        render: () => <span className="text-gray-500 text-[10px]">+</span> },

      { key: "rev_agent", label: "人材見込", width: 90, align: "right" as const, category: "sales",
        render: (c) => {
          if (!isAgentCustomer(c)) return <span className="text-gray-600 text-xs">-</span>;
          const v = calcExpectedReferralFee(c);
          return v > 0 ? <span className="text-xs">{formatCurrency(v)}</span> : <span className="text-gray-600 text-xs">-</span>;
        }, sortValue: (c) => isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0 },

      { key: "rev_eq", label: "=", width: 16, align: "center" as const, category: "sales",
        render: () => <span className="text-gray-500 text-[10px]">=</span> },

      { key: "rev_total", label: "見込含む売上", width: 100, align: "right" as const, category: "sales",
        render: (c) => {
          const school = getSchoolRevenue(c);
          const agent = isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0;
          const subsidyOk = subsidyOverrides[c.id] ?? c.contract?.subsidy_eligible;
          const subsidy = subsidyOk ? getSubsidyAmount(c) : 0;
          const total = school + agent + subsidy;
          return total > 0 ? <span className="font-semibold text-brand text-xs">{formatCurrency(total)}</span> : "-";
        }, sortValue: (c) => {
          const school = getSchoolRevenue(c);
          const agent = isAgentCustomer(c) ? calcExpectedReferralFee(c) : 0;
          const subsidyOk = subsidyOverrides[c.id] ?? c.contract?.subsidy_eligible;
          return school + agent + (subsidyOk ? getSubsidyAmount(c) : 0);
        } },
      { key: "expected_ltv", label: "見込みLTV", width: 100, align: "right" as const, category: "sales",
        render: (c) => {
          const ltv = calcExpectedLTV(c);
          return ltv > 0 ? <span className="text-xs text-cyan-400">{formatCurrency(ltv)}</span> : "-";
        }, sortValue: (c) => calcExpectedLTV(c) },

      // ─── マーケ帰属（概要に表示） ───
      { key: "marketing_channel", label: "帰属チャネル", width: 120, category: "base",
        filterValue: (c) => attributionMap[c.id]?.marketing_channel || "",
        render: (c) => {
          const attr = attributionMap[c.id];
          return attr ? <span className={`inline-block px-2 py-px rounded-full text-[10px] leading-none font-medium whitespace-nowrap ${getChannelColor(attr.marketing_channel)}`}>{attr.marketing_channel}</span> : <span className="text-gray-600 text-xs">-</span>;
        }, sortValue: (c) => attributionMap[c.id]?.marketing_channel || "" },
      { key: "initial_channel_base", label: "初回認知", width: 100, category: "base",
        render: (c) => <span className="text-xs text-gray-300">{c.pipeline?.initial_channel || "-"}</span>,
        sortValue: (c) => c.pipeline?.initial_channel || "",
        filterValue: (c) => c.pipeline?.initial_channel || "" },
      { key: "application_reason_base", label: "決め手", width: 120, category: "base",
        render: (c) => <span className="text-xs text-gray-300 truncate block">{(c as unknown as Record<string, unknown>).application_reason_karte as string || c.application_reason || "-"}</span>,
        sortValue: (c) => c.application_reason || "",
        filterValue: (c) => c.application_reason || "" },
      { key: "utm_source_base", label: "utm", width: 80, category: "base",
        render: (c) => <span className="text-xs text-gray-400">{c.utm_source || "-"}</span>,
        sortValue: (c) => c.utm_source || "",
        filterValue: (c) => c.utm_source || "" },
      { key: "sales_route_base", label: "営業ルート", width: 90, category: "base",
        render: (c) => <span className="text-xs text-gray-400 truncate block">{c.pipeline?.sales_route || "-"}</span>,
        sortValue: (c) => c.pipeline?.sales_route || "",
        filterValue: (c) => c.pipeline?.sales_route || "" },

      // ═══ マーケティング（タブ内） ═══
      { key: "initial_channel", label: "初回認知経路", width: 110, category: "marketing",
        render: (c) => <span className="text-xs">{c.pipeline?.initial_channel || "-"}</span>,
        filterValue: (c) => c.pipeline?.initial_channel || "" },
      { key: "application_reason", label: "申し込みの決め手", width: 160, category: "marketing",
        render: (c) => c.application_reason || "-",
        filterValue: (c) => c.application_reason || "" },
      { key: "sales_route", label: "経路(営業)", width: 100, category: "marketing",
        render: (c) => <span className="text-xs">{c.pipeline?.sales_route || c.pipeline?.route_by_sales || "-"}</span>,
        filterValue: (c) => c.pipeline?.sales_route || "" },
      { key: "comparison_services", label: "比較サービス", width: 140, category: "marketing",        render: (c) => c.pipeline?.comparison_services || "-" },
      { key: "utm_source", label: "utm_source", width: 90, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_source || "-"}</span>, sortValue: (c) => c.utm_source || "",
        filterValue: (c) => c.utm_source || "" },
      { key: "utm_medium", label: "utm_medium", width: 90, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_medium || "-"}</span>,
        filterValue: (c) => c.utm_medium || "" },
      { key: "utm_id", label: "utm_id", width: 70, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_id || "-"}</span>,
        filterValue: (c) => c.utm_id || "" },
      { key: "utm_campaign", label: "utm_campaign", width: 100, category: "marketing",
        render: (c) => <span className="text-xs">{c.utm_campaign || "-"}</span>,
        filterValue: (c) => c.utm_campaign || "" },

      // ═══ 営業（青） ═══
      { key: "meeting_scheduled", label: "営業予定日", width: 82, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.pipeline?.meeting_scheduled_date)}</span>,
        sortValue: (c) => c.pipeline?.meeting_scheduled_date || "" },

      { key: "decision_factor", label: "申込の決め手", width: 160, category: "sales",        render: (c) => c.pipeline?.decision_factor || "-" },

      { key: "sales_date", label: "営業日", width: 78, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.pipeline?.sales_date)}</span>,
        sortValue: (c) => c.pipeline?.sales_date || "" },

      { key: "probability", label: "確度", width: 60, align: "center" as const, category: "sales",
        render: (c) => {
          const p = c.pipeline?.probability;
          return p != null ? <span className={`inline-block px-2 py-px rounded-full text-[10px] leading-none font-medium ${getProbabilityColor(p)}`}>{formatPercent(p)}</span> : <span className="text-gray-600 text-xs">-</span>;
        },
        sortValue: (c) => c.pipeline?.probability || 0 },

      { key: "additional_coaching_date", label: "追加指導日", width: 82, category: "sales",
        render: (c) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = (c.pipeline as any)?.additional_coaching_date;
          return <span className="text-xs">{fmtDate(d)}</span>;
        },
        sortValue: (c) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (c.pipeline as any)?.additional_coaching_date || "";
        }},

      { key: "response_deadline", label: "返答期限", width: 82, category: "sales",
        render: (c) => <span className="text-xs">{fmtDate(c.pipeline?.response_deadline)}</span>,
        sortValue: (c) => c.pipeline?.response_deadline || "" },

      { key: "sales_person", label: "営業担当", width: 90, category: "sales",
        render: (c) => {
          const sp = c.pipeline?.sales_person;
          return sp ? <span className={`inline-block px-2 py-px rounded-full text-[10px] leading-none font-medium whitespace-nowrap ${getSalesPersonColor(sp)}`}>{sp}</span> : <span className="text-gray-600 text-xs">-</span>;
        },
        filterValue: (c) => c.pipeline?.sales_person || "" },

      { key: "sales_content", label: "営業内容", width: 240, category: "sales",        render: (c) => c.pipeline?.sales_content || "-" },

      { key: "sales_strategy", label: "営業方針", width: 220, category: "sales",        render: (c) => c.pipeline?.sales_strategy || "-" },

      { key: "jicoo_message", label: "jicooメッセージ", width: 160, category: "sales",        render: (c) => c.pipeline?.jicoo_message || "-" },

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
        render: (c) => <span className="text-xs">{fmtDate(firstPaidMap[c.id] || c.contract?.payment_date)}</span>,
        sortValue: (c) => firstPaidMap[c.id] || c.contract?.payment_date || "" },
      { key: "call_memo", label: "架電メモ", width: 240, category: "sales",
        render: (c) => {
          const memo = callMemoOverrides[c.id] !== undefined ? callMemoOverrides[c.id] : c.pipeline?.call_memo;
          return <InlineTextArea customerId={c.id} value={memo} onSave={handleCallMemoSave} />;
        } },
      { key: "additional_notes", label: "[追加]学び", width: 140, category: "sales",        render: (c) => c.pipeline?.additional_notes || "-" },

      // ─── 追加指導（営業） ───
      { key: "additional_sales_content", label: "[追加]営業内容", width: 160, category: "sales",        render: (c) => c.pipeline?.additional_sales_content || "-" },
      { key: "additional_plan", label: "[追加]プラン", width: 110, category: "sales",
        render: (c) => <span className="text-xs">{c.pipeline?.additional_plan || "-"}</span> },
      { key: "additional_discount_info", label: "[追加]割引案内", width: 130, category: "sales",        render: (c) => c.pipeline?.additional_discount_info || "-" },

      // ═══ 人材紹介（紫） ═══
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
        render: (c) => {
          if (!isAgentCustomer(c)) return <span className="text-gray-600 text-xs">-</span>;
          return isAgentConfirmed(c) ? <span className="text-purple-400 font-medium">確定</span> : <span className="text-gray-500 text-xs">未確定</span>;
        } },
      { key: "agent_staff", label: "エージェント担当", width: 100, category: "agent",
        render: (c) => <span className="text-xs">{c.agent?.agent_staff || "-"}</span> },
      { key: "agent_memo", label: "エージェント業務メモ", width: 150, category: "agent",        render: (c) => c.agent?.agent_memo || "-" },
      { key: "loss_reason", label: "失注理由", width: 140, category: "agent",        render: (c) => c.agent?.loss_reason || "-" },

      // ═══ エデュケーション（緑） ═══
      { key: "offer_company", label: "内定先", width: 120, category: "education",
        render: (c) => <span className="text-xs">{c.agent?.offer_company || "-"}</span> },
      { key: "enrollment_status", label: "受講状況", width: 90, category: "education",
        render: (c) => <span className="text-xs">{c.contract?.enrollment_status || "-"}</span>,
        filterValue: (c) => c.contract?.enrollment_status || "" },
      { key: "plan_name", label: "プラン名", width: 150, category: "education",
        render: (c) => {
          const p = c.contract?.plan_name;
          return p ? <span className={`inline-block px-2 py-px rounded-full text-[10px] leading-none font-medium whitespace-nowrap ${getPlanColor(p)}`}>{p}</span> : <span className="text-gray-600 text-xs">-</span>;
        },
        filterValue: (c) => c.contract?.plan_name || "" },
      { key: "mentor_name", label: "メンター", width: 80, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.mentor_name || "-"}</span>,
        filterValue: (c) => c.learning?.mentor_name || "" },
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
      { key: "progress_text", label: "進捗テキスト", width: 160, category: "education",        render: (c) => c.learning?.progress_text || "-" },
      { key: "selection_status", label: "選考状況", width: 140, category: "education",        render: (c) => c.learning?.selection_status || "-" },
      { key: "level_up_range", label: "レベルアップ幅", width: 100, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.level_up_range || "-"}</span> },
      { key: "initial_coaching_level", label: "指導開始時レベル", width: 110, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.initial_coaching_level || "-"}</span> },
      { key: "coaching_requests", label: "指導要望", width: 160, category: "education",        render: (c) => c.learning?.coaching_requests || "-" },
      { key: "enrollment_reason", label: "入会理由", width: 160, category: "education",        render: (c) => c.learning?.enrollment_reason || "-" },
      { key: "behavior_session1", label: "ビヘイビア1", width: 120, category: "education",        render: (c) => c.learning?.behavior_session1 || "-" },
      { key: "behavior_session2", label: "ビヘイビア2", width: 120, category: "education",        render: (c) => c.learning?.behavior_session2 || "-" },
      { key: "assessment_session1", label: "アセスメント1", width: 130, category: "education",        render: (c) => c.learning?.assessment_session1 || "-" },
      { key: "assessment_session2", label: "アセスメント2", width: 130, category: "education",        render: (c) => c.learning?.assessment_session2 || "-" },
      { key: "case_interview_progress", label: "ケース面接進捗", width: 160, category: "education",        render: (c) => c.learning?.case_interview_progress || "-" },
      { key: "case_interview_weaknesses", label: "ケース面接苦手", width: 140, category: "education",        render: (c) => c.learning?.case_interview_weaknesses || "-" },
      { key: "interview_timing_at_end", label: "面接予定(終了時)", width: 140, category: "education",        render: (c) => c.learning?.interview_timing_at_end || "-" },
      { key: "target_companies_at_end", label: "受験企業(終了時)", width: 140, category: "education",        render: (c) => c.learning?.target_companies_at_end || "-" },
      { key: "offer_probability_at_end", label: "内定確度判定", width: 90, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.offer_probability_at_end || "-"}</span> },
      { key: "additional_coaching_proposal", label: "追加指導提案", width: 140, category: "education",        render: (c) => c.learning?.additional_coaching_proposal || "-" },
      { key: "mentoring_satisfaction", label: "メンタリング満足度", width: 110, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.mentoring_satisfaction || "-"}</span> },
      { key: "start_email_sent", label: "開始メール送付", width: 100, category: "education",
        render: (c) => <span className="text-xs">{c.learning?.start_email_sent || "-"}</span> },
      { key: "extension_days", label: "延長(日)", width: 70, align: "right" as const, category: "education",
        render: (c) => c.learning?.extension_days != null ? `${c.learning.extension_days}` : "-" },

      // ═══ 連絡先 ═══
      { key: "phone", label: "電話番号", width: 120,
        render: (c) => <span className="text-xs">{c.phone || "-"}</span>, sortValue: (c) => c.phone || "" },
      { key: "email", label: "メールアドレス", width: 180,
        render: (c) => <span className="text-xs truncate block" style={{ maxWidth: 180 }}>{c.email || "-"}</span>, sortValue: (c) => c.email || "" },

      // ═══ その他基本情報 ═══
      { key: "university", label: "大学名", width: 110,
        render: (c) => <span className="text-xs">{c.university || "-"}</span>, sortValue: (c) => c.university || "" },
      { key: "target_companies", label: "志望企業", width: 160,        render: (c) => c.target_companies || "-" },
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
      { key: "agent_memo", label: "メモ", width: 160,        render: (c) => c.agent?.agent_memo || "-" },
    ],
    [attributionMap, stageOverrides, handleStageUpdate, subsidyOverrides, handleSubsidyToggle, agentExcludeOverrides, handleReferralCategoryChange, jobStatusOverrides, handleJobStatusChange, offerRankOverrides, handleOfferRankChange, callMemoOverrides, handleCallMemoSave]
  );

  // 日程未確タブ: データフィルタリング
  const SCHEDULE_UNCONFIRMED_STAGES = new Set(["日程未確", "実施不可", "失注見込", "失注見込(自動)"]);
  const NOSHOW_CL_STAGES = new Set(["NoShow", "キャンセル"]);

  const tabFiltered = useMemo(() => {
    if (activeTab !== "schedule_unconfirmed") return baseFiltered;
    return baseFiltered.filter((c) => {
      // 追加指導日が入っている顧客は非表示
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((c.pipeline as any)?.additional_coaching_date) return false;
      const stage = stageOverrides[c.id] || c.pipeline?.stage || "";
      // NoShow or キャンセル → 常に表示
      if (NOSHOW_CL_STAGES.has(stage)) return true;
      // 日程未確/実施不可/失注見込/失注見込(自動) かつ 営業日が空
      if (SCHEDULE_UNCONFIRMED_STAGES.has(stage) && !c.pipeline?.sales_date) return true;
      return false;
    });
  }, [baseFiltered, activeTab, stageOverrides]);

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
          {tabFiltered.length}件{loadingMore ? ` / ${totalCount}件 読込中...` : totalCount > 0 && totalCount !== tabFiltered.length ? ` / ${totalCount}件` : ""}
        </span>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-md hover:bg-brand/90 transition-colors shrink-0"
        >
          + 新規登録
        </button>

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

        {/* エージェント利用者フィルタ */}
        <button
          onClick={() => setAgentFilter((v) => !v)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
            agentFilter
              ? "bg-brand text-white border-brand"
              : "bg-surface-elevated text-gray-400 hover:text-white border-white/10"
          }`}
        >
          エージェント利用者
        </button>

        {/* 補助金利用者フィルタ */}
        <button
          onClick={() => setSubsidyFilter((v) => !v)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
            subsidyFilter
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-surface-elevated text-gray-400 hover:text-white border-white/10"
          }`}
        >
          補助金利用者
        </button>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="px-2 py-1 bg-surface-elevated border border-white/10 text-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">全ステージ</option>
          <optgroup label="未実施">
            <option value="日程未確">日程未確</option>
            <option value="未実施">未実施</option>
            <option value="実施不可">実施不可</option>
          </optgroup>
          <optgroup label="アクティブ">
            <option value="検討中">検討中</option>
            <option value="長期検討">長期検討</option>
          </optgroup>
          <optgroup label="成約">
            <option value="成約">成約</option>
            <option value="成約見込(未入金)">成約見込(未入金)</option>
          </optgroup>
          <optgroup label="購入・追加">
            <option value="その他購入">その他購入</option>
            <option value="動画講座購入">動画講座購入</option>
            <option value="追加指導">追加指導</option>
          </optgroup>
          <optgroup label="失注">
            <option value="失注">失注</option>
            <option value="失注見込">失注見込</option>
            <option value="失注見込(自動)">失注見込(自動)</option>
            <option value="NoShow">NoShow</option>
            <option value="キャンセル">キャンセル</option>
            <option value="全額返金">全額返金</option>
          </optgroup>
          <optgroup label="その他">
            <option value="非実施対象">非実施対象</option>
          </optgroup>
        </select>
      </div>

      {/* ビュータブ */}
      <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5 w-fit border border-white/10">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); if (tab.key === "agent") setAgentFilter(true); }}
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

      {/* テーブル */}
      {loading ? (
        <div className="bg-surface-card rounded-xl border border-white/10 p-8 text-center">
          <div className="text-gray-400 text-sm">読み込み中...</div>
        </div>
      ) : (<SpreadsheetTable
        columns={spreadsheetColumns}
        data={tabFiltered}
        getRowKey={(c) => c.id}
        storageKey={`customers-${activeTab}`}
        searchPlaceholder="名前・メール・大学・経歴・チャネルで検索..."
        initialSearch={initialSearch}
        pageSize={100}
        searchFilter={(c, q) => {
          // スペース有無を無視して検索（「小形 哲司」「小形哲司」両方マッチ）
          const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");
          const nq = normalize(q);
          return normalize(c.name).includes(nq) ||
            (c.email ? normalize(c.email).includes(nq) : false) ||
            (c.university ? normalize(c.university).includes(nq) : false) ||
            (c.career_history ? normalize(c.career_history).includes(nq) : false) ||
            (attributionMap[c.id]?.marketing_channel ? normalize(attributionMap[c.id].marketing_channel).includes(nq) : false);
        }}
      />
      )}

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
                    <option value="日程未確">日程未確</option>
                    <option value="未実施">未実施</option>
                    <option value="検討中">検討中</option>
                    <option value="成約">成約</option>
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
