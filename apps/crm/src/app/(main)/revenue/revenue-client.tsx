"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
  collapsibleGroup?: string;
  parentGroup?: string;
  avg6m?: number | null;
  avg12m?: number | null;
}

type PeriodRange = "6m" | "12m" | "all";
type SegmentTab = "all" | "kisotsu" | "shinsotsu" | "other";

interface CostData {
  period: string;
  cost_of_sales: number;
  sga: number;
}

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
  showGradYear?: boolean,
): TableRow[] {
  const rows: TableRow[] = [];
  // チャンネルを成約数降順にソート
  const sortByClosedDesc = <T extends { totals: PLFunnelCounts }>(arr: T[]): T[] =>
    [...arr].sort((a, b) => (b.totals.closed || 0) - (a.totals.closed || 0));
  const organicChannels = sortByClosedDesc(data.channels.filter((ch) => !ch.isPaid));
  const paidChannels = sortByClosedDesc(data.channels.filter((ch) => ch.isPaid));

  // --- 6行売上構造 ---
  // a: スクール確定売上（補助金含）
  rows.push({
    key: "school_confirmed",
    label: "a. スクール確定売上（補助金含）",
    indent: 0,
    style: "subtotal",
    format: "currency",
    values: periods.map((p) => data.schoolConfirmedRevenue[p] || null),
    totalValue: data.schoolConfirmedRevenueTotal,
  });
  // b: 人材確定売上
  rows.push({
    key: "agent_confirmed_rev",
    label: "b. 人材確定売上",
    indent: 0,
    style: "subtotal",
    format: "currency",
    values: periods.map((p) => data.agentConfirmedRevenue[p] || null),
    totalValue: data.agentConfirmedRevenueTotal,
  });
  // c: 人材見込売上
  rows.push({
    key: "agent_projected_rev",
    label: "c. 人材見込売上",
    indent: 0,
    style: "subtotal",
    format: "currency",
    values: periods.map((p) => data.agentProjectedByPeriod[p] || null),
    totalValue: data.agentProjected,
  });
  // d: 確定売上 = a + b
  rows.push({
    key: "confirmed_revenue",
    label: "d. 確定売上（a+b）",
    indent: 0,
    style: "total",
    format: "currency",
    values: periods.map((p) => data.confirmedRevenue[p] || null),
    totalValue: data.confirmedRevenueTotal,
  });
  // e: 見込売上（人材見込含）= a + b + c
  rows.push({
    key: "revenue",
    label: "e. 見込売上（a+b+c）",
    indent: 0,
    style: "total",
    format: "currency",
    values: periods.map((p) => data.revenue[p] || null),
    totalValue: data.revenueTotal,
  });
  // f: 予測売上 = 見込みLTV合計 × 月消化率補正
  rows.push({
    key: "forecast_revenue",
    label: "f. 予測売上（Forecast）",
    indent: 0,
    style: "total",
    format: "currency",
    values: periods.map((p) => data.forecastRevenue[p] || null),
    totalValue: data.forecastRevenueTotal,
  });



  rows.push(sep("sep_rev"));

  // --- ファネル各ステップ ---
  const funnelMetrics: {
    key: keyof PLFunnelCounts;
    label: string;
    rateLabel?: string;
    rateSuffix?: string;
    denomKey?: keyof PLFunnelCounts;
    excludeAC?: boolean;
  }[] = [
    { key: "closed", label: "成約数", rateLabel: "成約率", rateSuffix: "（成約/営業完了）", denomKey: "conducted", excludeAC: true },
    { key: "conducted", label: "実施数", rateLabel: "実施率", rateSuffix: "（実施/日程確定）", denomKey: "scheduled" },
    { key: "scheduled", label: "日程確定数", rateLabel: "日程確定率", rateSuffix: "（日程確定/申込）", denomKey: "applications" },
    { key: "applications", label: "申込数" },
  ];

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

    // organic小計（折りたたみ）
    rows.push({
      key: organicGroupId,
      label: "organic計",
      indent: 1,
      style: "subtotal",
      format: "number",
      values: periods.map((p) => sumChannels(organicChannels, p, metric.key)),
      totalValue: organicChannels.reduce((s, ch) => s + ch.totals[metric.key], 0),
      collapsibleGroup: organicGroupId,
    });

    for (const ch of organicChannels) {
      rows.push({
        key: `${metric.key}_o_${ch.name}`,
        label: ch.name,
        indent: 2,
        style: "channel",
        format: "number",
        values: periods.map((p) => ch.funnel[p]?.[metric.key] || null),
        totalValue: ch.totals[metric.key],
        parentGroup: organicGroupId,
      });
    }

    // paid小計（折りたたみ）
    rows.push({
      key: paidGroupId,
      label: "paid計",
      indent: 1,
      style: "subtotal",
      format: "number",
      values: periods.map((p) => sumChannels(paidChannels, p, metric.key)),
      totalValue: paidChannels.reduce((s, ch) => s + ch.totals[metric.key], 0),
      collapsibleGroup: paidGroupId,
    });

    for (const ch of paidChannels) {
      rows.push({
        key: `${metric.key}_p_${ch.name}`,
        label: ch.name,
        indent: 2,
        style: "channel",
        format: "number",
        values: periods.map((p) => ch.funnel[p]?.[metric.key] || null),
        totalValue: ch.totals[metric.key],
        parentGroup: paidGroupId,
      });
    }

    // レート行（チャネル別折りたたみ付き）
    if (metric.rateLabel && metric.denomKey) {
      const dk = metric.denomKey;
      const useACExclusion = !!metric.excludeAC;
      const rateOrganicGroup = `${metric.key}_rate_organic`;
      const ratePaidGroup = `${metric.key}_rate_paid`;

      // 分母計算ヘルパー: excludeAC の場合は追加指導を差し引く
      const getDenom = (counts: PLFunnelCounts | undefined): number => {
        if (!counts) return 0;
        const base = counts[dk] || 0;
        return useACExclusion ? base - (counts.additional_coaching || 0) : base;
      };
      const getChDenom = (channels: typeof organicChannels, p: string): number => {
        const base = sumChannelsRaw(channels, p, dk);
        if (!useACExclusion) return base;
        return base - sumChannelsRaw(channels, p, "additional_coaching");
      };
      const getChTotalDenom = (channels: typeof organicChannels): number => {
        const base = channels.reduce((s, ch) => s + ch.totals[dk], 0);
        if (!useACExclusion) return base;
        return base - channels.reduce((s, ch) => s + (ch.totals.additional_coaching || 0), 0);
      };

      // 全体レート
      rows.push({
        key: `${metric.key}_rate`,
        label: `◆${metric.rateLabel}${metric.rateSuffix || ""}`,
        indent: 0,
        style: "rate",
        format: "percent",
        values: periods.map((p) => {
          const num = data.totals[p]?.[metric.key] || 0;
          const den = getDenom(data.totals[p]);
          return den > 0 ? num / den : null;
        }),
        totalValue: (() => {
          const num = data.grandTotals[metric.key];
          const den = useACExclusion
            ? data.grandTotals[dk] - (data.grandTotals.additional_coaching || 0)
            : data.grandTotals[dk];
          return den > 0 ? num / den : null;
        })(),
      });

      // organic率小計（折りたたみ）
      rows.push({
        key: rateOrganicGroup,
        label: "organic計",
        indent: 1,
        style: "subtotal",
        format: "percent",
        values: periods.map((p) => {
          const num = sumChannelsRaw(organicChannels, p, metric.key);
          const den = getChDenom(organicChannels, p);
          return den > 0 ? num / den : null;
        }),
        totalValue: (() => {
          const num = organicChannels.reduce((s, ch) => s + ch.totals[metric.key], 0);
          const den = getChTotalDenom(organicChannels);
          return den > 0 ? num / den : null;
        })(),
        collapsibleGroup: rateOrganicGroup,
      });

      for (const ch of organicChannels) {
        rows.push({
          key: `${metric.key}_rate_o_${ch.name}`,
          label: ch.name,
          indent: 2,
          style: "channel",
          format: "percent",
          values: periods.map((p) => {
            const num = ch.funnel[p]?.[metric.key] || 0;
            const den = useACExclusion
              ? (ch.funnel[p]?.[dk] || 0) - (ch.funnel[p]?.additional_coaching || 0)
              : (ch.funnel[p]?.[dk] || 0);
            return den > 0 ? num / den : null;
          }),
          totalValue: (() => {
            const den = useACExclusion
              ? ch.totals[dk] - (ch.totals.additional_coaching || 0)
              : ch.totals[dk];
            return den > 0 ? ch.totals[metric.key] / den : null;
          })(),
          parentGroup: rateOrganicGroup,
        });
      }

      // paid率小計（折りたたみ）
      rows.push({
        key: ratePaidGroup,
        label: "paid計",
        indent: 1,
        style: "subtotal",
        format: "percent",
        values: periods.map((p) => {
          const num = sumChannelsRaw(paidChannels, p, metric.key);
          const den = getChDenom(paidChannels, p);
          return den > 0 ? num / den : null;
        }),
        totalValue: (() => {
          const num = paidChannels.reduce((s, ch) => s + ch.totals[metric.key], 0);
          const den = getChTotalDenom(paidChannels);
          return den > 0 ? num / den : null;
        })(),
        collapsibleGroup: ratePaidGroup,
      });

      for (const ch of paidChannels) {
        rows.push({
          key: `${metric.key}_rate_p_${ch.name}`,
          label: ch.name,
          indent: 2,
          style: "channel",
          format: "percent",
          values: periods.map((p) => {
            const num = ch.funnel[p]?.[metric.key] || 0;
            const den = useACExclusion
              ? (ch.funnel[p]?.[dk] || 0) - (ch.funnel[p]?.additional_coaching || 0)
              : (ch.funnel[p]?.[dk] || 0);
            return den > 0 ? num / den : null;
          }),
          totalValue: (() => {
            const den = useACExclusion
              ? ch.totals[dk] - (ch.totals.additional_coaching || 0)
              : ch.totals[dk];
            return den > 0 ? ch.totals[metric.key] / den : null;
          })(),
          parentGroup: ratePaidGroup,
        });
      }
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
    label: "スクール確定LTV（補助金込み）",
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

  // --- 人材紹介（月別） ---
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
    values: periods.map((p) => data.agentConfirmedByPeriod[p] || null),
    totalValue: data.agentConfirmed,
  });

  rows.push({
    key: "agent_projected",
    label: "見込額",
    indent: 1,
    style: "value",
    format: "currency",
    values: periods.map((p) => data.agentProjectedByPeriod[p] || null),
    totalValue: data.agentProjected,
  });

  rows.push(sep("sep_agent"));

  // --- チャネル別 LTV ---
  // ピュア/複合を統合したチャネルデータを作成
  const mergeChannelName = (name: string) => name.replace(/^(ピュア|複合|自社)/, "");
  const mergedChannelMap = new Map<string, { revenue: number; applications: number; closed: number; revenueByPeriod: Record<string, number>; funnelByPeriod: Record<string, { applications: number; closed: number }> }>();

  for (const ch of [...organicChannels, ...paidChannels]) {
    const merged = mergeChannelName(ch.name);
    const ex = mergedChannelMap.get(merged) || { revenue: 0, applications: 0, closed: 0, revenueByPeriod: {}, funnelByPeriod: {} };
    ex.revenue += ch.revenue;
    ex.applications += ch.totals.applications;
    ex.closed += ch.totals.closed;
    for (const p of periods) {
      ex.revenueByPeriod[p] = (ex.revenueByPeriod[p] || 0) + (ch.revenueByPeriod[p] || 0);
      if (!ex.funnelByPeriod[p]) ex.funnelByPeriod[p] = { applications: 0, closed: 0 };
      ex.funnelByPeriod[p].applications += ch.funnel[p]?.applications || 0;
      ex.funnelByPeriod[p].closed += ch.funnel[p]?.closed || 0;
    }
    mergedChannelMap.set(merged, ex);
  }
  const mergedChannels = Array.from(mergedChannelMap.entries())
    .filter(([, v]) => v.applications >= 3)
    .sort((a, b) => b[1].closed - a[1].closed);

  // 直近6ヶ月・12ヶ月のインデックス計算
  const last6Periods = periods.slice(-6);
  const last12Periods = periods.slice(-12);

  function avgOverPeriods(calcFn: (p: string) => number | null, targetPeriods: string[]): number | null {
    const vals = targetPeriods.map(calcFn).filter((v): v is number => v !== null && v > 0);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  function sumOverPeriods(calcFn: (p: string) => number | null, targetPeriods: string[]): number | null {
    const vals = targetPeriods.map(calcFn).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0));
  }

  rows.push({
    key: "ch_ltv_header",
    label: "◆チャネル別 LTV",
    indent: 0,
    style: "header",
    format: "none",
    values: [],
    totalValue: null,
  });

  // ── 申込あたりLTV セクション ──
  rows.push({
    key: "ltv_per_app_section",
    label: "申込あたりLTV",
    indent: 1,
    style: "subtotal",
    format: "none",
    values: [],
    totalValue: null,
  });

  // 全体
  rows.push({
    key: "ltv_per_app_total",
    label: "全体",
    indent: 2,
    style: "total",
    format: "currency",
    values: periods.map((p) => {
      const apps = data.totals[p]?.applications || 0;
      const rev = data.confirmedRevenue[p] || 0;
      return apps > 0 ? Math.round(rev / apps) : null;
    }),
    totalValue: data.ltvPerApp,
    avg6m: avgOverPeriods((p) => {
      const apps = data.totals[p]?.applications || 0;
      const rev = data.confirmedRevenue[p] || 0;
      return apps > 0 ? Math.round(rev / apps) : null;
    }, last6Periods),
    avg12m: avgOverPeriods((p) => {
      const apps = data.totals[p]?.applications || 0;
      const rev = data.confirmedRevenue[p] || 0;
      return apps > 0 ? Math.round(rev / apps) : null;
    }, last12Periods),
  });

  // チャネル別
  for (const [chName, ch] of mergedChannels) {
    rows.push({
      key: `ltv_per_app_${chName}`,
      label: chName,
      indent: 2,
      style: "channel",
      format: "currency",
      values: periods.map((p) => {
        const apps = ch.funnelByPeriod[p]?.applications || 0;
        const rev = ch.revenueByPeriod[p] || 0;
        return apps > 0 ? Math.round(rev / apps) : null;
      }),
      totalValue: ch.applications > 0 ? Math.round(ch.revenue / ch.applications) : null,
      avg6m: avgOverPeriods((p) => {
        const apps = ch.funnelByPeriod[p]?.applications || 0;
        const rev = ch.revenueByPeriod[p] || 0;
        return apps > 0 ? Math.round(rev / apps) : null;
      }, last6Periods),
      avg12m: avgOverPeriods((p) => {
        const apps = ch.funnelByPeriod[p]?.applications || 0;
        const rev = ch.revenueByPeriod[p] || 0;
        return apps > 0 ? Math.round(rev / apps) : null;
      }, last12Periods),
    });
  }

  rows.push(sep("sep_ch_ltv_app"));

  // ── 売上合計 セクション ──
  rows.push({
    key: "ch_rev_section",
    label: "売上合計",
    indent: 1,
    style: "subtotal",
    format: "none",
    values: [],
    totalValue: null,
  });

  // 全体
  rows.push({
    key: "ch_rev_total",
    label: "全体",
    indent: 2,
    style: "total",
    format: "currency",
    values: periods.map((p) => data.confirmedRevenue[p] || null),
    totalValue: data.confirmedRevenueTotal,
    avg6m: sumOverPeriods((p) => data.confirmedRevenue[p] || null, last6Periods),
    avg12m: sumOverPeriods((p) => data.confirmedRevenue[p] || null, last12Periods),
  });

  // チャネル別
  for (const [chName, ch] of mergedChannels) {
    rows.push({
      key: `ch_rev_${chName}`,
      label: chName,
      indent: 2,
      style: "channel",
      format: "currency",
      values: periods.map((p) => ch.revenueByPeriod[p] || null),
      totalValue: ch.revenue || null,
      avg6m: sumOverPeriods((p) => ch.revenueByPeriod[p] || null, last6Periods),
      avg12m: sumOverPeriods((p) => ch.revenueByPeriod[p] || null, last12Periods),
    });
  }

  rows.push(sep("sep_ch_ltv"));

  // --- 卒年別申込数（新卒のみ） ---
  if (showGradYear && data.graduationYearApps) {
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

/** null を返さない版（レート計算用） */
function sumChannelsRaw(
  channels: { funnel: Record<string, PLFunnelCounts>; totals: PLFunnelCounts }[],
  period: string,
  metric: keyof PLFunnelCounts
): number {
  return channels.reduce(
    (s, ch) => s + (ch.funnel[period]?.[metric] || 0),
    0
  );
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
// その他売上セクション
// ================================================================

function OtherRevenueSection({
  otherRevenues,
  periods,
}: {
  otherRevenues?: OtherRevenueSummary;
  periods: string[];
}) {
  const rows = useMemo(() => {
    const result: TableRow[] = [];
    if (!otherRevenues) return result;

    const allPeriodKeys = Object.keys(otherRevenues);
    const noteTotal = allPeriodKeys.reduce((s, p) => s + (otherRevenues[p]?.note || 0), 0);
    const mvTotal = allPeriodKeys.reduce((s, p) => s + (otherRevenues[p]?.myvision || 0), 0);
    const otherTotal = allPeriodKeys.reduce((s, p) => s + (otherRevenues[p]?.other || 0), 0);

    result.push({
      key: "other_total",
      label: "その他売上合計",
      indent: 0,
      style: "total",
      format: "currency",
      values: periods.map((p) => {
        const r = otherRevenues[p];
        return r ? (r.note + r.myvision + r.other) || null : null;
      }),
      totalValue: noteTotal + mvTotal + otherTotal,
    });
    result.push({
      key: "note_rev",
      label: "note売上",
      indent: 1,
      style: "value",
      format: "currency",
      values: periods.map((p) => otherRevenues[p]?.note || null),
      totalValue: noteTotal,
    });
    result.push({
      key: "myvision_rev",
      label: "MyVision受託",
      indent: 1,
      style: "value",
      format: "currency",
      values: periods.map((p) => otherRevenues[p]?.myvision || null),
      totalValue: mvTotal,
    });
    if (otherTotal > 0) {
      result.push({
        key: "misc_rev",
        label: "その他",
        indent: 1,
        style: "value",
        format: "currency",
        values: periods.map((p) => otherRevenues[p]?.other || null),
        totalValue: otherTotal,
      });
    }
    return result;
  }, [otherRevenues, periods]);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10">
      <div className="px-6 py-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">その他売上</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 sticky left-0 bg-surface-card z-10 min-w-[220px]">
                項目
              </th>
              {periods.map((p) => (
                <th key={p} className="text-right py-2 px-3 text-xs font-semibold text-gray-500 min-w-[75px]">
                  {p}
                </th>
              ))}
              <th className="text-right py-2 px-3 text-xs font-semibold text-blue-400 min-w-[80px] border-l border-white/10">
                6ヶ月avg
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-blue-400 min-w-[80px]">
                12ヶ月avg
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-white min-w-[90px] border-l border-white/10">
                合計
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const bg = getRowBg(row.style);
              const labelCls = getLabelStyle(row.style);
              const valCls = getValueStyle(row.style);
              const totCls = getTotalStyle(row.style);
              return (
                <tr key={row.key} className={`border-b border-white/[0.06] ${bg}`}>
                  <td className={`py-1.5 px-3 sticky left-0 z-10 bg-surface-card ${labelCls}`}
                      style={{ paddingLeft: `${12 + row.indent * 16}px` }}>
                    {row.label}
                  </td>
                  {row.values.map((v, i) => (
                    <td key={i} className={`py-1.5 px-3 text-right ${valCls}`}>
                      {fmtValue(v, row.format)}
                    </td>
                  ))}
                  <td className={`py-1.5 px-3 text-right border-l border-white/10 ${totCls}`}>
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
// 全社セクション（既卒+新卒+その他 + 費用 + 利益）
// ================================================================

function AllCompanySection({
  data,
  otherRevenues,
  costData,
  periods,
}: {
  data: PLSegmentData;
  otherRevenues?: OtherRevenueSummary;
  costData: CostData[] | null;
  periods: string[];
}) {
  const rows = useMemo(() => {
    const result: TableRow[] = [];

    // その他売上の月別合計を計算
    const otherByPeriod: Record<string, number> = {};
    let otherTotal = 0;
    if (otherRevenues) {
      for (const p of Object.keys(otherRevenues)) {
        const r = otherRevenues[p];
        const sum = (r?.note || 0) + (r?.myvision || 0) + (r?.other || 0);
        otherByPeriod[p] = sum;
        otherTotal += sum;
      }
    }

    // 費用データをperiod→CostDataのマップに
    const costMap: Record<string, CostData> = {};
    if (costData) {
      for (const c of costData) costMap[c.period] = c;
    }

    // === 売上 ===
    // a: スクール確定（補助金含）
    result.push({
      key: "all_school_confirmed",
      label: "a. スクール確定売上（補助金含）",
      indent: 0, style: "subtotal", format: "currency",
      values: periods.map((p) => data.schoolConfirmedRevenue[p] || null),
      totalValue: data.schoolConfirmedRevenueTotal,
    });
    // b: 人材確定
    result.push({
      key: "all_agent_confirmed",
      label: "b. 人材確定売上",
      indent: 0, style: "subtotal", format: "currency",
      values: periods.map((p) => data.agentConfirmedRevenue[p] || null),
      totalValue: data.agentConfirmedRevenueTotal,
    });
    // c: 人材見込
    result.push({
      key: "all_agent_projected",
      label: "c. 人材見込売上",
      indent: 0, style: "subtotal", format: "currency",
      values: periods.map((p) => data.agentProjectedByPeriod[p] || null),
      totalValue: data.agentProjected,
    });
    // その他売上（確定）
    result.push({
      key: "all_other_rev",
      label: "その他売上（note/MV等）",
      indent: 0, style: "subtotal", format: "currency",
      values: periods.map((p) => otherByPeriod[p] || null),
      totalValue: otherTotal,
    });

    result.push(sep("sep_all1"));

    // d: 確定売上 = a + b + その他
    result.push({
      key: "all_confirmed",
      label: "d. 確定売上（a+b+その他）",
      indent: 0, style: "total", format: "currency",
      values: periods.map((p) => {
        const v = (data.confirmedRevenue[p] || 0) + (otherByPeriod[p] || 0);
        return v || null;
      }),
      totalValue: data.confirmedRevenueTotal + otherTotal,
    });
    // e: 見込売上 = a + b + c + その他
    result.push({
      key: "all_revenue",
      label: "e. 見込売上（a+b+c+その他）",
      indent: 0, style: "total", format: "currency",
      values: periods.map((p) => {
        const v = (data.revenue[p] || 0) + (otherByPeriod[p] || 0);
        return v || null;
      }),
      totalValue: data.revenueTotal + otherTotal,
    });
    // f: 予測売上 = 見込みLTV合計×月消化率 + その他
    result.push({
      key: "all_forecast",
      label: "f. 予測売上（Forecast）",
      indent: 0, style: "total", format: "currency",
      values: periods.map((p) => {
        const v = (data.forecastRevenue[p] || 0) + (otherByPeriod[p] || 0);
        return v || null;
      }),
      totalValue: data.forecastRevenueTotal + otherTotal,
    });

    result.push(sep("sep_all2"));

    // === 費用 ===
    result.push({
      key: "cost_header",
      label: "◆費用（freee）",
      indent: 0, style: "header", format: "none",
      values: [], totalValue: null,
    });

    const cogsValues = periods.map((p) => costMap[p]?.cost_of_sales || null);
    const sgaValues = periods.map((p) => costMap[p]?.sga || null);
    const totalCostValues = periods.map((p) => {
      const c = costMap[p];
      return c ? (c.cost_of_sales + c.sga) || null : null;
    });
    const cogsTotal = Object.values(costMap).reduce((s, c) => s + c.cost_of_sales, 0);
    const sgaTotal = Object.values(costMap).reduce((s, c) => s + c.sga, 0);

    result.push({
      key: "cost_cogs",
      label: "売上原価",
      indent: 1, style: "value", format: "currency",
      values: cogsValues, totalValue: cogsTotal || null,
    });
    result.push({
      key: "cost_sga",
      label: "販管費",
      indent: 1, style: "value", format: "currency",
      values: sgaValues, totalValue: sgaTotal || null,
    });
    result.push({
      key: "cost_total",
      label: "費用合計",
      indent: 0, style: "total", format: "currency",
      values: totalCostValues, totalValue: (cogsTotal + sgaTotal) || null,
    });

    result.push(sep("sep_all3"));

    // === 利益 ===
    // 確定売上ベース利益
    result.push({
      key: "profit_confirmed",
      label: "利益（確定売上 - 費用）",
      indent: 0, style: "total", format: "currency",
      values: periods.map((p) => {
        const rev = (data.confirmedRevenue[p] || 0) + (otherByPeriod[p] || 0);
        const cost = costMap[p] ? costMap[p].cost_of_sales + costMap[p].sga : 0;
        return (rev - cost) || null;
      }),
      totalValue: (data.confirmedRevenueTotal + otherTotal - cogsTotal - sgaTotal) || null,
    });
    // 予測売上ベース利益
    result.push({
      key: "profit_forecast",
      label: "利益（Forecast - 費用）",
      indent: 0, style: "total", format: "currency",
      values: periods.map((p) => {
        const rev = (data.forecastRevenue[p] || 0) + (otherByPeriod[p] || 0);
        const cost = costMap[p] ? costMap[p].cost_of_sales + costMap[p].sga : 0;
        return (rev - cost) || null;
      }),
      totalValue: (data.forecastRevenueTotal + otherTotal - cogsTotal - sgaTotal) || null,
    });

    return result;
  }, [data, otherRevenues, costData, periods]);

  return (
    <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10">
      <div className="px-6 py-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">全社 P/L</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 sticky left-0 bg-surface-card z-10 min-w-[220px]">
                項目
              </th>
              {periods.map((p) => (
                <th key={p} className="text-right py-2 px-3 text-xs font-semibold text-gray-500 min-w-[75px]">
                  {p}
                </th>
              ))}
              <th className="text-right py-2 px-3 text-xs font-semibold text-blue-400 min-w-[80px] border-l border-white/10">
                6ヶ月avg
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-blue-400 min-w-[80px]">
                12ヶ月avg
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-white min-w-[90px] border-l border-white/10">
                合計
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (row.style === "separator") {
                return <tr key={row.key}><td colSpan={periods.length + 2} className="h-2" /></tr>;
              }
              const bg = getRowBg(row.style);
              const labelCls = getLabelStyle(row.style);
              const valCls = getValueStyle(row.style);
              const totCls = getTotalStyle(row.style);
              const hasValues = row.values.length > 0;
              return (
                <tr key={row.key} className={`border-b border-white/[0.06] ${bg}`}>
                  <td className={`py-1.5 px-3 sticky left-0 z-10 bg-surface-card ${labelCls}`}
                      style={{ paddingLeft: `${12 + row.indent * 16}px` }}>
                    {row.label}
                  </td>
                  {hasValues
                    ? row.values.map((v, i) => (
                        <td key={i} className={`py-1.5 px-3 text-right ${valCls}`}>
                          {fmtValue(v, row.format)}
                        </td>
                      ))
                    : periods.map((_, i) => <td key={i} className="py-1.5 px-3" />)}
                  <td className={`py-1.5 px-3 text-right border-l border-white/10 ${totCls}`}>
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
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 sticky left-0 bg-surface-card z-10 min-w-[220px]">
                項目
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-blue-400 min-w-[80px] border-r border-white/10">
                直近6ヶ月
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-blue-400 min-w-[80px] border-r border-white/10">
                直近12ヶ月
              </th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-white min-w-[90px] border-r border-white/10">
                合計
              </th>
              {periods.map((p) => (
                <th
                  key={p}
                  className="text-right py-2 px-3 text-xs font-semibold text-gray-500 min-w-[75px]"
                >
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (row.parentGroup && collapsedGroups.has(row.parentGroup)) {
                return null;
              }

              if (row.style === "separator") {
                return (
                  <tr key={row.key}>
                    <td colSpan={periods.length + 4} className="h-2" />
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
                  <td className={`py-1.5 px-3 text-right border-r border-white/10 ${totCls}`}>
                    {fmtValue(row.avg6m ?? null, row.format)}
                  </td>
                  <td className={`py-1.5 px-3 text-right border-r border-white/10 ${totCls}`}>
                    {fmtValue(row.avg12m ?? null, row.format)}
                  </td>
                  <td
                    className={`py-1.5 px-3 text-right border-r border-white/10 ${totCls}`}
                  >
                    {fmtValue(row.totalValue, row.format)}
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

export interface OtherRevenueSummary {
  [period: string]: { note: number; myvision: number; other: number };
}

interface RevenueClientProps {
  plData: PLSheetData;
  otherRevenues?: OtherRevenueSummary;
}

/** 2つのPLSegmentDataの売上系フィールドを合算 */
function mergeSegments(a: PLSegmentData, b: PLSegmentData): PLSegmentData {
  const mergeRec = (x: Record<string, number>, y: Record<string, number>): Record<string, number> => {
    const result: Record<string, number> = { ...x };
    for (const k of Object.keys(y)) {
      result[k] = (result[k] || 0) + (y[k] || 0);
    }
    return result;
  };
  return {
    ...a,
    revenue: mergeRec(a.revenue, b.revenue),
    confirmedRevenue: mergeRec(a.confirmedRevenue, b.confirmedRevenue),
    forecastRevenue: mergeRec(a.forecastRevenue, b.forecastRevenue),
    revenueTotal: a.revenueTotal + b.revenueTotal,
    confirmedRevenueTotal: a.confirmedRevenueTotal + b.confirmedRevenueTotal,
    forecastRevenueTotal: a.forecastRevenueTotal + b.forecastRevenueTotal,
    schoolConfirmedRevenue: mergeRec(a.schoolConfirmedRevenue, b.schoolConfirmedRevenue),
    schoolConfirmedRevenueTotal: a.schoolConfirmedRevenueTotal + b.schoolConfirmedRevenueTotal,
    agentConfirmedRevenue: mergeRec(a.agentConfirmedRevenue, b.agentConfirmedRevenue),
    agentConfirmedRevenueTotal: a.agentConfirmedRevenueTotal + b.agentConfirmedRevenueTotal,
    expectedLtvRevenue: mergeRec(a.expectedLtvRevenue, b.expectedLtvRevenue),
    expectedLtvRevenueTotal: a.expectedLtvRevenueTotal + b.expectedLtvRevenueTotal,
    agentConfirmedByPeriod: mergeRec(a.agentConfirmedByPeriod, b.agentConfirmedByPeriod),
    agentProjectedByPeriod: mergeRec(a.agentProjectedByPeriod, b.agentProjectedByPeriod),
    agentConfirmed: a.agentConfirmed + b.agentConfirmed,
    agentProjected: a.agentProjected + b.agentProjected,
    // 以下は全社で合算しても意味が薄いがインターフェース互換のため
    channels: [],
    totals: {},
    grandTotals: a.grandTotals,
    ltvSchool: {},
    ltvWithAgent: {},
    cumulativeLtvSchool: 0,
    cumulativeLtvWithAgent: 0,
    ltvPerApp: 0,
  };
}

export function RevenueClient({ plData, otherRevenues }: RevenueClientProps) {
  const [periodRange, setPeriodRange] = useState<PeriodRange>("12m");
  const [segmentTab, setSegmentTab] = useState<SegmentTab>("all");
  const [costData, setCostData] = useState<CostData[] | null>(null);

  // freee費用データ取得
  useEffect(() => {
    const now = new Date();
    const m = now.getMonth() + 1;
    const fy = m >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    fetch(`/api/freee/pl?startYear=${fy - 1}&endYear=${fy}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d) && d.length > 0) {
          setCostData(d.map((item: CostData) => ({
            period: item.period,
            cost_of_sales: item.cost_of_sales,
            sga: item.sga,
          })));
        }
      })
      .catch(() => {});
  }, []);

  const displayPeriods = useMemo(() => {
    const periods = periodRange === "all"
      ? plData.periods
      : plData.periods.slice(-(periodRange === "6m" ? 6 : 12));
    return [...periods].reverse();
  }, [plData.periods, periodRange]);

  // 全社タブ用: 既卒+新卒を合算
  const allSegmentData = useMemo(
    () => mergeSegments(plData.kisotsu, plData.shinsotsu),
    [plData.kisotsu, plData.shinsotsu]
  );

  const tabConfig: { key: SegmentTab; label: string }[] = [
    { key: "all", label: "全社" },
    { key: "kisotsu", label: "既卒" },
    { key: "shinsotsu", label: "新卒" },
    { key: "other", label: "その他" },
  ];

  const tabLabels: Record<SegmentTab, string> = {
    all: "全社 P/L",
    kisotsu: "既卒スクール×エージェント事業",
    shinsotsu: "新卒スクール事業",
    other: "その他売上",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">PL</h1>
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {tabConfig.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSegmentTab(key)}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                  segmentTab === key
                    ? "bg-brand text-white font-medium"
                    : "text-gray-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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

      {segmentTab === "other" ? (
        <OtherRevenueSection
          otherRevenues={otherRevenues}
          periods={displayPeriods}
        />
      ) : segmentTab === "all" ? (
        <AllCompanySection
          data={allSegmentData}
          otherRevenues={otherRevenues}
          costData={costData}
          periods={displayPeriods}
        />
      ) : (
        <PLSection
          label={tabLabels[segmentTab]}
          data={segmentTab === "kisotsu" ? plData.kisotsu : plData.shinsotsu}
          periods={displayPeriods}
          showGradYear={segmentTab === "shinsotsu"}
        />
      )}
    </div>
  );
}
