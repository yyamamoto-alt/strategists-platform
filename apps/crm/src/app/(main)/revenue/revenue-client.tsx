"use client";

import { useMemo, useState, useCallback } from "react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type {
  PLSheetData,
  PLSegmentData,
  PLFunnelCounts,
} from "@strategy-school/shared-db";

// ================================================================
// 型定義
// ================================================================

type RowStyle =
  | "sectionHeader"
  | "header"
  | "total"
  | "subtotal"
  | "channel"
  | "rate"
  | "value"
  | "separator";

type RowFormat = "number" | "currency" | "percent" | "none";

interface TableRow {
  key: string;
  label: string;
  indent: number;
  style: RowStyle;
  format: RowFormat;
  values: (number | null)[];
  totalValue: number | null;
  /** 折りたたみ可能な行の場合、グループIDを指定 */
  collapsibleGroup?: string;
  /** この行が属する折りたたみグループID */
  parentGroup?: string;
}

type PeriodRange = "6m" | "12m" | "all";

// ================================================================
// フォーマッター
// ================================================================

function fmtValue(v: number | null, format: RowFormat): string {
  if (v === null || v === undefined) return "";
  if (format === "currency") return v === 0 ? "" : formatCurrency(v);
  if (format === "percent") return formatPercent(v);
  if (format === "number") return v === 0 ? "" : v.toLocaleString();
  return "";
}

// ================================================================
// 行ビルダー
// ================================================================

function buildRows(
  data: PLSegmentData,
  periods: string[],
  showGradYear?: boolean
): TableRow[] {
  const rows: TableRow[] = [];

  // --- 売上 ---
  rows.push({
    key: "revenue",
    label: "売上（確定+人材見込）",
    indent: 0,
    style: "total",
    format: "currency",
    values: periods.map((p) => data.revenue[p] || null),
    totalValue: data.revenueTotal,
  });

  rows.push({
    key: "confirmed_revenue",
    label: "確定売上",
    indent: 0,
    style: "total",
    format: "currency",
    values: periods.map((p) => data.confirmedRevenue[p] || null),
    totalValue: data.confirmedRevenueTotal,
  });

  rows.push(sep("sep_rev"));

  // --- ファネル各ステップ ---
  const funnelMetrics: {
    key: keyof PLFunnelCounts;
    label: string;
    rateLabel?: string;
    denomKey?: keyof PLFunnelCounts;
  }[] = [
    { key: "closed", label: "成約数", rateLabel: "成約率", denomKey: "conducted" },
    { key: "conducted", label: "実施数", rateLabel: "実施率", denomKey: "scheduled" },
    { key: "scheduled", label: "日程確定数", rateLabel: "日程確定率", denomKey: "applications" },
    { key: "applications", label: "申込数" },
  ];

  const organicChannels = data.channels.filter((ch) => !ch.isPaid);
  const paidChannels = data.channels.filter((ch) => ch.isPaid);

  for (const metric of funnelMetrics) {
    const organicGroupId = `${metric.key}_organic`;
    const paidGroupId = `${metric.key}_paid`;

    // ヘッダー
    rows.push({
      key: `${metric.key}_header`,
      label: `◆${metric.label}`,
      indent: 0,
      style: "header",
      format: "none",
      values: [],
      totalValue: null,
    });

    // 合計
    rows.push({
      key: `${metric.key}_total`,
      label: "合計",
      indent: 1,
      style: "total",
      format: "number",
      values: periods.map((p) => data.totals[p]?.[metric.key] ?? null),
      totalValue: data.grandTotals[metric.key],
    });

    // organic小計（折りたたみトグル）
    rows.push({
      key: organicGroupId,
      label: "organic計",
      indent: 1,
      style: "subtotal",
      format: "number",
      values: periods.map((p) =>
        sumChannels(organicChannels, p, metric.key)
      ),
      totalValue: organicChannels.reduce(
        (s, ch) => s + ch.totals[metric.key],
        0
      ),
      collapsibleGroup: organicGroupId,
    });

    // organic個別チャネル（折りたたみ対象）
    for (const ch of organicChannels) {
      rows.push({
        key: `${metric.key}_o_${ch.name}`,
        label: ch.name,
        indent: 2,
        style: "channel",
        format: "number",
        values: periods.map(
          (p) => ch.funnel[p]?.[metric.key] || null
        ),
        totalValue: ch.totals[metric.key],
        parentGroup: organicGroupId,
      });
    }

    // paid小計（折りたたみトグル）
    rows.push({
      key: paidGroupId,
      label: "paid計",
      indent: 1,
      style: "subtotal",
      format: "number",
      values: periods.map((p) =>
        sumChannels(paidChannels, p, metric.key)
      ),
      totalValue: paidChannels.reduce(
        (s, ch) => s + ch.totals[metric.key],
        0
      ),
      collapsibleGroup: paidGroupId,
    });

    // paid個別チャネル（折りたたみ対象）
    for (const ch of paidChannels) {
      rows.push({
        key: `${metric.key}_p_${ch.name}`,
        label: ch.name,
        indent: 2,
        style: "channel",
        format: "number",
        values: periods.map(
          (p) => ch.funnel[p]?.[metric.key] || null
        ),
        totalValue: ch.totals[metric.key],
        parentGroup: paidGroupId,
      });
    }

    // レート行
    if (metric.rateLabel && metric.denomKey) {
      const dk = metric.denomKey;
      rows.push({
        key: `${metric.key}_rate`,
        label: `◆${metric.rateLabel}`,
        indent: 0,
        style: "rate",
        format: "percent",
        values: periods.map((p) => {
          const num = data.totals[p]?.[metric.key] || 0;
          const den = data.totals[p]?.[dk] || 0;
          return den > 0 ? num / den : null;
        }),
        totalValue: (() => {
          const num = data.grandTotals[metric.key];
          const den = data.grandTotals[dk];
          return den > 0 ? num / den : null;
        })(),
      });
    }

    rows.push(sep(`sep_${metric.key}`));
  }

  // --- LTV分析 ---
  rows.push({
    key: "ltv_header",
    label: "◆LTV分析",
    indent: 0,
    style: "header",
    format: "none",
    values: [],
    totalValue: null,
  });

  rows.push({
    key: "ltv_school",
    label: "スクール確定LTV",
    indent: 1,
    style: "value",
    format: "currency",
    values: periods.map((p) => data.ltvSchool[p] || null),
    totalValue: data.cumulativeLtvSchool,
  });

  rows.push({
    key: "ltv_with_agent",
    label: "確定+人材見込LTV",
    indent: 1,
    style: "value",
    format: "currency",
    values: periods.map((p) => data.ltvWithAgent[p] || null),
    totalValue: data.cumulativeLtvWithAgent,
  });

  rows.push(sep("sep_ltv"));

  // --- 人材紹介 ---
  rows.push({
    key: "agent_header",
    label: "◆人材紹介",
    indent: 0,
    style: "header",
    format: "none",
    values: [],
    totalValue: null,
  });

  rows.push({
    key: "agent_confirmed",
    label: "確定額",
    indent: 1,
    style: "value",
    format: "currency",
    values: periods.map(() => null),
    totalValue: data.agentConfirmed,
  });

  rows.push({
    key: "agent_projected",
    label: "見込額",
    indent: 1,
    style: "value",
    format: "currency",
    values: periods.map(() => null),
    totalValue: data.agentProjected,
  });

  rows.push(sep("sep_agent"));

  // --- 申込あたりLTV・ターゲットCPA ---
  rows.push({
    key: "ltv_per_app",
    label: "◆申込あたりLTV",
    indent: 0,
    style: "total",
    format: "currency",
    values: periods.map(() => null),
    totalValue: data.ltvPerApp,
  });

  rows.push({
    key: "target_cpa",
    label: "◆ターゲットCPA (30%)",
    indent: 0,
    style: "total",
    format: "currency",
    values: periods.map(() => null),
    totalValue: data.targetCpa,
  });

  // --- 卒年別申込数（新卒のみ） ---
  if (showGradYear && data.graduationYearApps) {
    rows.push(sep("sep_grad"));
    rows.push({
      key: "grad_header",
      label: "◆卒年別申込数",
      indent: 0,
      style: "header",
      format: "none",
      values: [],
      totalValue: null,
    });

    const years = Object.keys(data.graduationYearApps).sort();
    for (const year of years) {
      const yearData = data.graduationYearApps[year];
      rows.push({
        key: `grad_${year}`,
        label: `${year}年卒`,
        indent: 1,
        style: "value",
        format: "number",
        values: periods.map((p) => yearData[p] || null),
        totalValue: Object.values(yearData).reduce((s, v) => s + v, 0),
      });
    }
  }

  return rows;
}

function sep(key: string): TableRow {
  return {
    key,
    label: "",
    indent: 0,
    style: "separator",
    format: "none",
    values: [],
    totalValue: null,
  };
}

function sumChannels(
  channels: { funnel: Record<string, PLFunnelCounts>; totals: PLFunnelCounts }[],
  period: string,
  metric: keyof PLFunnelCounts
): number | null {
  const total = channels.reduce(
    (s, ch) => s + (ch.funnel[period]?.[metric] || 0),
    0
  );
  return total || null;
}

// ================================================================
// スタイルヘルパー
// ================================================================

function getRowBg(style: RowStyle): string {
  switch (style) {
    case "header":
      return "bg-white/[0.03]";
    case "total":
      return "bg-white/[0.02]";
    case "rate":
      return "bg-blue-500/[0.03]";
    default:
      return "";
  }
}

function getLabelStyle(style: RowStyle): string {
  switch (style) {
    case "header":
      return "font-semibold text-gray-200";
    case "total":
      return "font-semibold text-white";
    case "subtotal":
      return "font-medium text-gray-300";
    case "channel":
      return "text-gray-400";
    case "rate":
      return "font-medium text-blue-400";
    case "value":
      return "text-gray-300";
    default:
      return "";
  }
}

function getValueStyle(style: RowStyle): string {
  switch (style) {
    case "total":
      return "font-medium text-white";
    case "subtotal":
      return "text-gray-300";
    case "channel":
      return "text-gray-400";
    case "rate":
      return "text-blue-400";
    default:
      return "text-gray-300";
  }
}

function getTotalStyle(style: RowStyle): string {
  switch (style) {
    case "total":
      return "font-semibold text-white";
    case "subtotal":
      return "font-medium text-gray-300";
    case "rate":
      return "font-medium text-blue-400";
    default:
      return "text-gray-300";
  }
}

// ================================================================
// PLSection コンポーネント
// ================================================================

function PLSection({
  label,
  data,
  periods,
  showGradYear,
}: {
  label: string;
  data: PLSegmentData;
  periods: string[];
  showGradYear?: boolean;
}) {
  const rows = useMemo(
    () => buildRows(data, periods, showGradYear),
    [data, periods, showGradYear]
  );

  // デフォルトですべて折りたたんだ状態
  const allCollapsibleGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const row of rows) {
      if (row.collapsibleGroup) groups.add(row.collapsibleGroup);
    }
    return groups;
  }, [rows]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(allCollapsibleGroups)
  );

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10">
      <div className="px-6 py-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">{label}</h2>
        <p className="text-xs text-gray-500 mt-1">
          申込 {data.grandTotals.applications} / 成約{" "}
          {data.grandTotals.closed} / 確定売上{" "}
          {formatCurrency(data.confirmedRevenueTotal)}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 sticky left-0 bg-surface-card z-10 min-w-[180px]">
                項目
              </th>
              {periods.map((p) => (
                <th
                  key={p}
                  className="text-right py-2 px-3 text-xs font-semibold text-gray-500 min-w-[75px]"
                >
                  {p}
                </th>
              ))}
              <th className="text-right py-2 px-3 text-xs font-semibold text-white min-w-[90px] border-l border-white/10">
                合計
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              // 折りたたまれたグループの子行はスキップ
              if (row.parentGroup && collapsedGroups.has(row.parentGroup)) {
                return null;
              }

              if (row.style === "separator") {
                return (
                  <tr key={row.key}>
                    <td colSpan={periods.length + 2} className="h-2" />
                  </tr>
                );
              }

              const bg = getRowBg(row.style);
              const labelCls = getLabelStyle(row.style);
              const valCls = getValueStyle(row.style);
              const totCls = getTotalStyle(row.style);
              const hasValues = row.values.length > 0;
              const isCollapsible = !!row.collapsibleGroup;
              const isCollapsed = row.collapsibleGroup
                ? collapsedGroups.has(row.collapsibleGroup)
                : false;

              return (
                <tr
                  key={row.key}
                  className={`border-b border-white/[0.06] ${bg} ${
                    isCollapsible ? "cursor-pointer hover:bg-white/[0.04]" : ""
                  }`}
                  onClick={
                    isCollapsible
                      ? () => toggleGroup(row.collapsibleGroup!)
                      : undefined
                  }
                >
                  <td
                    className={`py-1.5 px-3 sticky left-0 z-10 bg-surface-card ${labelCls} ${
                      isCollapsible ? "select-none" : ""
                    }`}
                    style={{ paddingLeft: `${12 + row.indent * 16}px` }}
                  >
                    {isCollapsible && (
                      <span className="inline-block w-4 text-gray-500 text-xs">
                        {isCollapsed ? "▸" : "▾"}
                      </span>
                    )}
                    {row.label}
                  </td>
                  {hasValues
                    ? row.values.map((v, i) => (
                        <td
                          key={i}
                          className={`py-1.5 px-3 text-right ${valCls}`}
                        >
                          {fmtValue(v, row.format)}
                        </td>
                      ))
                    : periods.map((_, i) => (
                        <td key={i} className="py-1.5 px-3" />
                      ))}
                  <td
                    className={`py-1.5 px-3 text-right border-l border-white/10 ${totCls}`}
                  >
                    {fmtValue(row.totalValue, row.format)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ================================================================
// メインコンポーネント
// ================================================================

interface RevenueClientProps {
  plData: PLSheetData;
}

export function RevenueClient({ plData }: RevenueClientProps) {
  const [periodRange, setPeriodRange] = useState<PeriodRange>("12m");

  const displayPeriods = useMemo(() => {
    if (periodRange === "all") return plData.periods;
    const n = periodRange === "6m" ? 6 : 12;
    return plData.periods.slice(-n);
  }, [plData.periods, periodRange]);

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">売上管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            P/L（Excel準拠）
          </p>
        </div>
        <div className="flex gap-1">
          {(["6m", "12m", "all"] as PeriodRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setPeriodRange(range)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                periodRange === range
                  ? "bg-brand text-white"
                  : "bg-white/10 text-gray-300 hover:bg-white/20"
              }`}
            >
              {range === "6m"
                ? "6ヶ月"
                : range === "12m"
                  ? "12ヶ月"
                  : "全期間"}
            </button>
          ))}
        </div>
      </div>

      <PLSection
        label="既卒スクール×エージェント事業"
        data={plData.kisotsu}
        periods={displayPeriods}
      />

      <PLSection
        label="新卒スクール事業"
        data={plData.shinsotsu}
        periods={displayPeriods}
        showGradYear
      />
    </div>
  );
}
