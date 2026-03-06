"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CustomerWithRelations } from "@strategy-school/shared-db";
import { isShinsotsu } from "@/lib/calc-fields";
import { formatCurrency, getStageColor, getDealStatusColor } from "@/lib/utils";
import { SpreadsheetTable, type SpreadsheetColumn } from "@/components/spreadsheet-table";

interface Props {
  customers: CustomerWithRelations[];
  firstPaidMap: Record<string, string>; // customer_id → first paid_at date (YYYY-MM-DD)
}

const SUBSIDY_START = "2026-02-10";

function generateWeekEnds(): string[] {
  const weeks: string[] = [];
  const start = new Date(2026, 1, 15); // 2026-02-15
  const today = new Date();
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 7);

  let current = new Date(start);
  while (current <= limit) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    const dd = String(current.getDate()).padStart(2, "0");
    weeks.push(`${yyyy}-${mm}-${dd}`);
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}まで`;
}

function isSubsidyTarget(c: CustomerWithRelations): boolean {
  if (isShinsotsu(c.attribute)) return false;
  // 営業日が2/10より後であることが絶対条件
  const salesDate = c.pipeline?.sales_date || "";
  return salesDate > SUBSIDY_START;
}

function isSupportStarted(c: CustomerWithRelations): boolean {
  return c.pipeline?.deal_status === "実施";
}

function isCourseStarted(c: CustomerWithRelations): boolean {
  const s = c.pipeline?.stage;
  return s === "成約" || s === "入金済" || (s?.startsWith("追加指導") ?? false);
}

interface WeeklyStats {
  weekEnd: string;
  label: string;
  collected: number;
  supported: number;
  courseStarted: number;
}

// テーブル用カラム定義
function buildColumns(paidMap: Record<string, string>): SpreadsheetColumn<CustomerWithRelations>[] {
  return [
    {
      key: "name",
      label: "名前",
      width: 160,
      stickyLeft: 0,
      render: (c) => (
        <Link href={`/customers/${c.id}`} className="text-brand hover:underline font-medium truncate block">
          {c.name}
        </Link>
      ),
    },
    {
      key: "attribute",
      label: "属性",
      width: 48,
      render: (c) => (
        <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${getAttributeColor(c.attribute)}`}>
          {c.attribute || "-"}
        </span>
      ),
    },
    {
      key: "application_date",
      label: "申込日",
      width: 90,
      render: (c) => <span className="text-gray-300 text-xs">{c.application_date || "-"}</span>,
    },
    {
      key: "sales_date",
      label: "営業日",
      width: 90,
      render: (c) => <span className="text-gray-300 text-xs">{c.pipeline?.sales_date || "-"}</span>,
    },
    {
      key: "deal_status",
      label: "実施状況",
      width: 80,
      render: (c) => {
        const s = c.pipeline?.deal_status || "-";
        return <span className={`text-xs px-1.5 py-0.5 rounded ${getDealStatusColor(s)}`}>{s}</span>;
      },
    },
    {
      key: "stage",
      label: "ステージ",
      width: 110,
      render: (c) => {
        const s = c.pipeline?.stage || "-";
        return <span className={`text-xs px-1.5 py-0.5 rounded ${getStageColor(s)}`}>{s}</span>;
      },
    },
    {
      key: "payment_date",
      label: "入金日",
      width: 90,
      render: (c) => <span className="text-gray-300 text-xs">{paidMap[c.id] || c.contract?.payment_date || "-"}</span>,
    },
    {
      key: "confirmed_amount",
      label: "確定売上",
      width: 100,
      render: (c) => (
        <span className="text-gray-300 text-xs">
          {c.contract?.confirmed_amount ? formatCurrency(c.contract.confirmed_amount) : "-"}
        </span>
      ),
    },
    {
      key: "plan_name",
      label: "プラン",
      width: 120,
      render: (c) => <span className="text-gray-300 text-xs truncate block">{c.contract?.plan_name || "-"}</span>,
    },
  ];
}

function getAttributeColor(attr: string | null | undefined): string {
  if (!attr) return "bg-gray-700 text-gray-400";
  if (attr === "既卒") return "bg-blue-900/60 text-blue-300";
  if (attr === "新卒") return "bg-green-900/60 text-green-300";
  return "bg-gray-700 text-gray-400";
}

type TabKey = "list" | "weekly";

export function SubsidyClient({ customers, firstPaidMap }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("weekly");
  const weekEnds = useMemo(() => generateWeekEnds(), []);
  const columns = useMemo(() => buildColumns(firstPaidMap), [firstPaidMap]);

  const subsidyCustomers = useMemo(
    () => customers.filter(isSubsidyTarget),
    [customers]
  );

  const weeklyStats: WeeklyStats[] = useMemo(() => {
    return weekEnds.map((weekEnd) => {
      const collected = subsidyCustomers.filter((c) => {
        const d = c.application_date || "";
        return d > SUBSIDY_START && d <= weekEnd;
      }).length;

      const supported = subsidyCustomers.filter((c) => {
        if (!isSupportStarted(c)) return false;
        const d = c.pipeline?.sales_date || "";
        return d > SUBSIDY_START && d <= weekEnd;
      }).length;

      const courseStarted = subsidyCustomers.filter((c) => {
        if (!isCourseStarted(c)) return false;
        // 初回決済日(orders) → contracts.payment_date → sales_date のフォールバック
        const d = firstPaidMap[c.id] || c.contract?.payment_date || c.pipeline?.sales_date || "";
        return d > SUBSIDY_START && d <= weekEnd;
      }).length;

      return { weekEnd, label: formatWeekLabel(weekEnd), collected, supported, courseStarted };
    });
  }, [weekEnds, subsidyCustomers]);

  const latest = weeklyStats[weeklyStats.length - 1];

  return (
    <div className="min-h-screen bg-surface-base p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">補助金</h1>
            <p className="text-gray-400 text-sm mt-1">
              リスキリング補助金 週次進捗（2026/2/10〜）
            </p>
          </div>
          <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5 border border-white/10">
            {([
              { key: "weekly" as TabKey, label: "週次推移" },
              { key: "list" as TabKey, label: "対象者リスト" },
            ]).map((tab) => (
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
        </div>

        {/* サマリーカード */}
        {latest && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "集客人数", value: latest.collected, sub: "サービスへの登録者数", color: "text-blue-400" },
              { label: "支援開始人数", value: latest.supported, sub: "営業実施済み", color: "text-green-400" },
              { label: "講座受講開始人数", value: latest.courseStarted, sub: "成約 + 追加指導", color: "text-purple-400" },
            ].map((item) => (
              <div key={item.label} className="bg-surface-card border border-white/10 rounded-xl p-5">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className={`text-3xl font-bold ${item.color} mt-1`}>
                  {item.value}
                  <span className="text-sm text-gray-400 ml-1">人</span>
                </p>
                <p className="text-[11px] text-gray-600 mt-1">{item.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* 週次推移テーブル */}
        {activeTab === "weekly" && (
          <div className="bg-surface-card border border-white/10 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">週次推移</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-6 py-3 text-gray-400 font-medium">指標</th>
                    {weeklyStats.map((w) => (
                      <th key={w.weekEnd} className="text-center px-4 py-3 text-gray-400 font-medium whitespace-nowrap">
                        {w.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="px-6 py-3 text-gray-300 font-medium">集客人数</td>
                    {weeklyStats.map((w) => (
                      <td key={w.weekEnd} className="text-center px-4 py-3 text-white font-semibold">{w.collected}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="px-6 py-3 text-gray-300 font-medium">支援開始人数</td>
                    {weeklyStats.map((w) => (
                      <td key={w.weekEnd} className="text-center px-4 py-3 text-white font-semibold">{w.supported}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-gray-300 font-medium">講座受講開始人数</td>
                    {weeklyStats.map((w) => (
                      <td key={w.weekEnd} className="text-center px-4 py-3 text-white font-semibold">{w.courseStarted}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 対象者リスト */}
        {activeTab === "list" && (
          <SpreadsheetTable
            columns={columns}
            data={subsidyCustomers}
            getRowKey={(c) => c.id}
            storageKey="subsidy-list"
            pageSize={100}
          />
        )}
      </div>
    </div>
  );
}
