"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { CustomerWithRelations } from "@strategy-school/shared-db";
import { formatDate, formatCurrency, formatPercent } from "@/lib/utils";
import {
  calcRemainingSessions,
  calcScheduleProgress,
  calcSessionProgress,
  calcProgressStatus,
  calcAgentProjectedRevenue,
  isAgentCustomer,
  isCurrentlyEnrolled,
} from "@/lib/calc-fields";
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from "@/components/spreadsheet-table";

interface EducationClientProps {
  customers: CustomerWithRelations[];
}

export function EducationClient({ customers }: EducationClientProps) {
  const [tab, setTab] = useState<"既卒" | "新卒">("既卒");

  // 成約済みのみ (受講中 + 卒業生)
  const enrolledCustomers = useMemo(
    () =>
      customers.filter(
        (c) => c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済"
      ),
    [customers]
  );

  const filteredByTab = useMemo(
    () => enrolledCustomers.filter((c) => c.attribute === tab),
    [enrolledCustomers, tab]
  );

  // KPI計算
  const kpis = useMemo(() => {
    const kisotsu = enrolledCustomers.filter((c) => c.attribute === "既卒");
    const shinsotsu = enrolledCustomers.filter((c) => c.attribute === "新卒");

    const currentlyEnrolledKisotsu = kisotsu.filter(isCurrentlyEnrolled).length;
    const currentlyEnrolledShinsotsu = shinsotsu.filter(isCurrentlyEnrolled).length;

    // 平均消化率
    let sessionProgressSum = 0;
    let sessionProgressCount = 0;
    for (const c of enrolledCustomers) {
      const p = calcSessionProgress(c);
      if (p !== null) {
        sessionProgressSum += p;
        sessionProgressCount++;
      }
    }
    const avgSessionProgress =
      sessionProgressCount > 0 ? sessionProgressSum / sessionProgressCount : 0;

    // 遅延者数
    const delayedCount = enrolledCustomers.filter(
      (c) => calcProgressStatus(c) === "遅延"
    ).length;

    // エージェント利用率
    const agentCount = enrolledCustomers.filter(isAgentCustomer).length;
    const agentRate =
      enrolledCustomers.length > 0 ? agentCount / enrolledCustomers.length : 0;

    return {
      currentlyEnrolledKisotsu,
      currentlyEnrolledShinsotsu,
      avgSessionProgress,
      delayedCount,
      agentRate,
      agentCount,
      totalEnrolled: enrolledCustomers.length,
    };
  }, [enrolledCustomers]);

  const columns: SpreadsheetColumn<CustomerWithRelations>[] = useMemo(
    () => [
      {
        key: "name",
        label: "顧客名",
        width: 160,
        render: (c) => (
          <Link href={`/customers/${c.id}`} className="text-brand hover:underline">
            {c.name}
          </Link>
        ),
        sortValue: (c) => c.name,
      },
      {
        key: "plan",
        label: "プラン",
        width: 160,
        render: (c) => c.contract?.plan_name || "-",
        sortValue: (c) => c.contract?.plan_name || "",
      },
      {
        key: "mentor",
        label: "メンター",
        width: 100,
        render: (c) => c.learning?.mentor_name || "-",
        sortValue: (c) => c.learning?.mentor_name || "",
      },
      {
        key: "start_date",
        label: "指導開始日",
        width: 100,
        render: (c) => formatDate(c.learning?.coaching_start_date ?? null),
        sortValue: (c) => c.learning?.coaching_start_date || "",
      },
      {
        key: "end_date",
        label: "指導終了日",
        width: 100,
        render: (c) => formatDate(c.learning?.coaching_end_date ?? null),
        sortValue: (c) => c.learning?.coaching_end_date || "",
      },
      {
        key: "contract_months",
        label: "契約月数",
        width: 80,
        align: "right",
        render: (c) =>
          c.learning?.contract_months ? `${c.learning.contract_months}ヶ月` : "-",
        sortValue: (c) => c.learning?.contract_months || 0,
      },
      {
        key: "total_sessions",
        label: "総指導回数",
        width: 90,
        align: "right",
        render: (c) => (c.learning?.total_sessions ?? "-"),
        sortValue: (c) => c.learning?.total_sessions || 0,
      },
      {
        key: "completed_sessions",
        label: "実施回数",
        width: 80,
        align: "right",
        render: (c) => (c.learning?.completed_sessions ?? "-"),
        sortValue: (c) => c.learning?.completed_sessions || 0,
      },
      {
        key: "remaining",
        label: "残指導回数",
        width: 90,
        align: "right",
        render: (c) => {
          const v = calcRemainingSessions(c);
          return c.learning ? v : "-";
        },
        sortValue: (c) => calcRemainingSessions(c),
      },
      {
        key: "schedule_progress",
        label: "日程消化率",
        width: 90,
        align: "right",
        render: (c) => {
          const v = calcScheduleProgress(c);
          return v !== null ? formatPercent(v) : "-";
        },
        sortValue: (c) => calcScheduleProgress(c) ?? -1,
      },
      {
        key: "session_progress",
        label: "指導消化率",
        width: 90,
        align: "right",
        render: (c) => {
          const v = calcSessionProgress(c);
          return v !== null ? formatPercent(v) : "-";
        },
        sortValue: (c) => calcSessionProgress(c) ?? -1,
      },
      {
        key: "progress_status",
        label: "進捗",
        width: 70,
        align: "center",
        render: (c) => {
          const status = calcProgressStatus(c);
          const color =
            status === "順調"
              ? "text-green-400"
              : status === "遅延"
                ? "text-red-400"
                : "text-gray-500";
          return <span className={`font-medium ${color}`}>{status}</span>;
        },
        sortValue: (c) => {
          const s = calcProgressStatus(c);
          return s === "遅延" ? 0 : s === "順調" ? 1 : 2;
        },
      },
      {
        key: "attendance",
        label: "出席率",
        width: 80,
        align: "right",
        render: (c) =>
          c.learning?.attendance_rate !== null && c.learning?.attendance_rate !== undefined
            ? formatPercent(c.learning.attendance_rate)
            : "-",
        sortValue: (c) => c.learning?.attendance_rate ?? -1,
      },
      {
        key: "level_fermi",
        label: "レベル(フェルミ)",
        width: 110,
        render: (c) => c.learning?.level_fermi || "-",
      },
      {
        key: "level_case",
        label: "レベル(ケース)",
        width: 110,
        render: (c) => c.learning?.level_case || "-",
      },
      {
        key: "level_mck",
        label: "レベル(McK)",
        width: 100,
        render: (c) => c.learning?.level_mck || "-",
      },
      {
        key: "current_level",
        label: "現在レベル",
        width: 90,
        render: (c) => c.learning?.current_level || "-",
        sortValue: (c) => c.learning?.current_level || "",
      },
      {
        key: "job_search",
        label: "就活ステータス",
        width: 110,
        render: (c) => c.agent?.job_search_status || "-",
        sortValue: (c) => c.agent?.job_search_status || "",
      },
      {
        key: "agent_enrolled",
        label: "エージェント利用",
        width: 110,
        align: "center",
        render: (c) =>
          isAgentCustomer(c) ? (
            <span className="text-green-400 font-medium">利用中</span>
          ) : (
            <span className="text-gray-500">-</span>
          ),
        sortValue: (c) => (isAgentCustomer(c) ? 1 : 0),
      },
      {
        key: "agent_revenue",
        label: "人材見込売上",
        width: 120,
        align: "right",
        render: (c) => {
          const v = calcAgentProjectedRevenue(c);
          return v > 0 ? formatCurrency(v) : "-";
        },
        sortValue: (c) => calcAgentProjectedRevenue(c),
      },
    ],
    []
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">エデュケーションDB</h1>
        <p className="text-sm text-gray-500 mt-1">
          受講状況・指導進捗の管理
        </p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">受講中</p>
          <p className="text-2xl font-bold text-white mt-1">
            {kpis.currentlyEnrolledKisotsu + kpis.currentlyEnrolledShinsotsu}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            既卒 {kpis.currentlyEnrolledKisotsu} / 新卒 {kpis.currentlyEnrolledShinsotsu}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">平均消化率</p>
          <p className="text-2xl font-bold text-white mt-1">
            {formatPercent(kpis.avgSessionProgress)}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">遅延者数</p>
          <p className={`text-2xl font-bold mt-1 ${kpis.delayedCount > 0 ? "text-red-400" : "text-white"}`}>
            {kpis.delayedCount}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">エージェント利用率</p>
          <p className="text-2xl font-bold text-white mt-1">
            {formatPercent(kpis.agentRate)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {kpis.agentCount}/{kpis.totalEnrolled}人
          </p>
        </div>
      </div>

      {/* タブ */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("既卒")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "既卒"
              ? "bg-brand text-white"
              : "bg-surface-elevated text-gray-400 hover:text-white"
          }`}
        >
          既卒（社会人）
          <span className="ml-1.5 text-xs opacity-75">
            {enrolledCustomers.filter((c) => c.attribute === "既卒").length}
          </span>
        </button>
        <button
          onClick={() => setTab("新卒")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "新卒"
              ? "bg-brand text-white"
              : "bg-surface-elevated text-gray-400 hover:text-white"
          }`}
        >
          新卒（学生）
          <span className="ml-1.5 text-xs opacity-75">
            {enrolledCustomers.filter((c) => c.attribute === "新卒").length}
          </span>
        </button>
      </div>

      {/* テーブル */}
      <SpreadsheetTable
        columns={columns}
        data={filteredByTab}
        getRowKey={(c) => c.id}
        searchPlaceholder="名前・メンター・プランで検索..."
        searchFilter={(c, q) =>
          c.name.toLowerCase().includes(q) ||
          (c.learning?.mentor_name?.toLowerCase().includes(q) ?? false) ||
          (c.contract?.plan_name?.toLowerCase().includes(q) ?? false)
        }
      />
    </div>
  );
}
