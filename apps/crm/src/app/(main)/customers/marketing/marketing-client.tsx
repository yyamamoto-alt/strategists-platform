"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { CustomerWithRelations } from "@strategy-school/shared-db";
import {
  formatDate,
  formatCurrency,
  formatPercent,
  getStageColor,
  getAttributeColor,
} from "@/lib/utils";
import {
  calcClosingProbability,
  calcExpectedLTV,
} from "@/lib/calc-fields";
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from "@/components/spreadsheet-table";

interface MarketingClientProps {
  customers: CustomerWithRelations[];
}

export function MarketingClient({ customers }: MarketingClientProps) {
  // KPI計算
  const kpis = useMemo(() => {
    // チャネル別集計
    const byChannel = new Map<string, { count: number; closed: number; ltvSum: number }>();
    for (const c of customers) {
      const ch = c.utm_source || "その他";
      if (!byChannel.has(ch)) byChannel.set(ch, { count: 0, closed: 0, ltvSum: 0 });
      const m = byChannel.get(ch)!;
      m.count++;
      const isClosed = c.pipeline?.stage === "成約" || c.pipeline?.stage === "入金済";
      if (isClosed) {
        m.closed++;
        m.ltvSum += calcExpectedLTV(c);
      }
    }

    const channelData = Array.from(byChannel.entries())
      .map(([channel, m]) => ({
        channel,
        count: m.count,
        closed: m.closed,
        closingRate: m.count > 0 ? m.closed / m.count : 0,
        avgLTV: m.closed > 0 ? Math.round(m.ltvSum / m.closed) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const top5Channels = channelData.slice(0, 5);
    const bestClosingChannel = [...channelData]
      .filter((c) => c.count >= 3)
      .sort((a, b) => b.closingRate - a.closingRate)[0];
    const bestLTVChannel = [...channelData]
      .filter((c) => c.closed >= 2)
      .sort((a, b) => b.avgLTV - a.avgLTV)[0];

    return { top5Channels, bestClosingChannel, bestLTVChannel, totalCustomers: customers.length };
  }, [customers]);

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
        key: "attribute",
        label: "属性",
        width: 70,
        render: (c) => (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAttributeColor(c.attribute)}`}>
            {c.attribute}
          </span>
        ),
        sortValue: (c) => c.attribute,
      },
      {
        key: "application_date",
        label: "申込日",
        width: 100,
        render: (c) => formatDate(c.application_date),
        sortValue: (c) => c.application_date || "",
      },
      {
        key: "utm_source",
        label: "utm_source",
        width: 120,
        render: (c) => c.utm_source || "-",
        sortValue: (c) => c.utm_source || "",
      },
      {
        key: "utm_medium",
        label: "utm_medium",
        width: 100,
        render: (c) => c.utm_medium || "-",
        sortValue: (c) => c.utm_medium || "",
      },
      {
        key: "initial_channel",
        label: "初回認知経路",
        width: 120,
        render: (c) => c.pipeline?.initial_channel || "-",
      },
      {
        key: "application_reason",
        label: "申込理由",
        width: 160,
        render: (c) => (
          <span className="max-w-[160px] truncate block" title={c.application_reason || ""}>
            {c.application_reason || "-"}
          </span>
        ),
      },
      {
        key: "application_reason_karte",
        label: "申込のきっかけ",
        width: 160,
        render: (c) => (
          <span className="max-w-[160px] truncate block" title={c.application_reason_karte || ""}>
            {c.application_reason_karte || "-"}
          </span>
        ),
      },
      {
        key: "utm_campaign",
        label: "utm_campaign",
        width: 120,
        render: (c) => c.utm_campaign || "-",
      },
      {
        key: "utm_id",
        label: "utm_id",
        width: 100,
        render: (c) => c.utm_id || "-",
      },
      {
        key: "stage",
        label: "ステージ",
        width: 90,
        render: (c) =>
          c.pipeline ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(c.pipeline.stage)}`}>
              {c.pipeline.stage}
            </span>
          ) : (
            "-"
          ),
        sortValue: (c) => c.pipeline?.stage || "",
      },
      {
        key: "closing_prob",
        label: "成約見込",
        width: 80,
        align: "right",
        render: (c) => formatPercent(calcClosingProbability(c)),
        sortValue: (c) => calcClosingProbability(c),
      },
      {
        key: "expected_ltv",
        label: "見込LTV",
        width: 110,
        align: "right",
        render: (c) => {
          const v = calcExpectedLTV(c);
          return v > 0 ? formatCurrency(v) : "-";
        },
        sortValue: (c) => calcExpectedLTV(c),
      },
      {
        key: "confirmed_amount",
        label: "確定売上",
        width: 110,
        align: "right",
        render: (c) =>
          c.contract?.confirmed_amount
            ? formatCurrency(c.contract.confirmed_amount)
            : "-",
        sortValue: (c) => c.contract?.confirmed_amount || 0,
      },
      {
        key: "sales_route",
        label: "営業ルート",
        width: 120,
        render: (c) => c.pipeline?.sales_route || c.pipeline?.route_by_sales || "-",
      },
      {
        key: "google_ads",
        label: "Google広告",
        width: 120,
        render: (c) => c.pipeline?.google_ads_target || "-",
      },
    ],
    []
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">マーケティングDB</h1>
        <p className="text-sm text-gray-500 mt-1">
          チャネル分析・流入元別パフォーマンス
        </p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-3">
            チャネル別申込数 TOP5
          </p>
          <div className="space-y-2">
            {kpis.top5Channels.map((ch) => (
              <div key={ch.channel} className="flex items-center justify-between">
                <span className="text-sm text-gray-300 truncate">{ch.channel}</span>
                <span className="text-sm font-medium text-white ml-2">{ch.count}件</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-2">
            最高成約率チャネル
          </p>
          {kpis.bestClosingChannel ? (
            <>
              <p className="text-2xl font-bold text-white">
                {kpis.bestClosingChannel.channel}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                成約率 {formatPercent(kpis.bestClosingChannel.closingRate)}
                （{kpis.bestClosingChannel.closed}/{kpis.bestClosingChannel.count}件）
              </p>
            </>
          ) : (
            <p className="text-gray-500 text-sm">データ不足</p>
          )}
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-2">
            最高LTVチャネル
          </p>
          {kpis.bestLTVChannel ? (
            <>
              <p className="text-2xl font-bold text-white">
                {kpis.bestLTVChannel.channel}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                平均LTV {formatCurrency(kpis.bestLTVChannel.avgLTV)}
                （{kpis.bestLTVChannel.closed}件成約）
              </p>
            </>
          ) : (
            <p className="text-gray-500 text-sm">データ不足</p>
          )}
        </div>
      </div>

      {/* テーブル */}
      <SpreadsheetTable
        columns={columns}
        data={customers}
        getRowKey={(c) => c.id}
        searchPlaceholder="名前・utm_source・utm_campaign で検索..."
        searchFilter={(c, q) =>
          c.name.toLowerCase().includes(q) ||
          (c.utm_source?.toLowerCase().includes(q) ?? false) ||
          (c.utm_campaign?.toLowerCase().includes(q) ?? false) ||
          (c.utm_medium?.toLowerCase().includes(q) ?? false)
        }
      />
    </div>
  );
}
