"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line,
} from "recharts";
import type { MetaCampaignDaily, MetaAdsetDaily, MetaAdDaily, AdsFunnelCustomer } from "@/lib/data/analytics";
import { AGENT_CATEGORIES } from "@/lib/calc-fields";
import { SubTab, KpiCard, GranularitySelector, getDataDateRange, getWeekKey, getMonthKey } from "./shared";
import type { AdsGranularity } from "./shared";

/* ───────── Color palette for stacked bars ───────── */
const CAMPAIGN_COLORS = [
  "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
  "#14b8a6", "#e11d48", "#a855f7", "#0ea5e9", "#facc15",
];

/* ───────── Format yen without K notation ───────── */
function fmtYen(v: number): string {
  return `¥${Math.round(v).toLocaleString()}`;
}

/* ───────── Meta Ads Tab Container ───────── */
type MetaSub = "overview" | "campaigns" | "creatives" | "funnel";

interface MetaAdsTabProps {
  metaCampaigns: MetaCampaignDaily[];
  metaAdsets: MetaAdsetDaily[];
  metaAds: MetaAdDaily[];
  metaFunnel: AdsFunnelCustomer[];
}

export function MetaAdsTab({ metaCampaigns, metaAdsets, metaAds, metaFunnel }: MetaAdsTabProps) {
  const [granularity, setGranularity] = useState<AdsGranularity>("weekly");
  const [metaSub, setMetaSub] = useState<MetaSub>("overview");

  // Date range filter
  const dataRange = useMemo(() => getDataDateRange(metaCampaigns), [metaCampaigns]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    const from = dateFrom || dataRange.min;
    const to = dateTo || dataRange.max;
    if (!from || !to) return metaCampaigns;
    return metaCampaigns.filter(r => r.date >= from && r.date <= to);
  }, [metaCampaigns, dateFrom, dateTo, dataRange]);

  const filteredAdsets = useMemo(() => {
    const from = dateFrom || dataRange.min;
    const to = dateTo || dataRange.max;
    if (!from || !to) return metaAdsets;
    return metaAdsets.filter(r => r.date >= from && r.date <= to);
  }, [metaAdsets, dateFrom, dateTo, dataRange]);

  const filteredAds = useMemo(() => {
    const from = dateFrom || dataRange.min;
    const to = dateTo || dataRange.max;
    if (!from || !to) return metaAds;
    return metaAds.filter(r => r.date >= from && r.date <= to);
  }, [metaAds, dateFrom, dateTo, dataRange]);

  if (metaCampaigns.length === 0) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">Meta Ads データはまだ収集中です。バックフィル完了後に表示されます。</p>
      </div>
    );
  }

  const effectiveFrom = dateFrom || dataRange.min;
  const effectiveTo = dateTo || dataRange.max;

  return (
    <div className="space-y-4">
      {/* Sub tabs + Date range picker */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <SubTab label="日別消化" active={metaSub === "overview"} onClick={() => setMetaSub("overview")} />
          <SubTab label="キャンペーン別" active={metaSub === "campaigns"} onClick={() => setMetaSub("campaigns")} />
          <SubTab label="クリエイティブ別" active={metaSub === "creatives"} onClick={() => setMetaSub("creatives")} />
          <SubTab label="成約顧客リスト" active={metaSub === "funnel"} onClick={() => setMetaSub("funnel")} />
        </div>
        {metaSub !== "funnel" && (
          <div className="flex items-center gap-2 text-xs">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              min={dataRange.min} max={dataRange.max}
              className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-gray-300 text-xs" />
            <span className="text-gray-500">〜</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              min={dataRange.min} max={dataRange.max}
              className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-gray-300 text-xs" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-gray-500 hover:text-white text-[10px] px-1.5 py-0.5 rounded bg-white/5">リセット</button>
            )}
            <span className="text-gray-600 text-[10px]">{effectiveFrom} 〜 {effectiveTo}</span>
          </div>
        )}
      </div>
      {metaSub === "overview" && <MetaOverview metaCampaigns={filtered} />}
      {metaSub === "campaigns" && <MetaCampaignTable metaCampaigns={filtered} granularity={granularity} setGranularity={setGranularity} />}
      {metaSub === "creatives" && <MetaCreativeTab metaAdsets={filteredAdsets} metaAds={filteredAds} metaCampaigns={filtered} />}
      {metaSub === "funnel" && <MetaFunnelTab metaFunnel={metaFunnel} />}
    </div>
  );
}

/* ═══════════════════════════════════════════
   OVERVIEW: 積み上げ棒グラフ + 日別テーブル
   ═══════════════════════════════════════════ */

function MetaOverview({ metaCampaigns }: { metaCampaigns: MetaCampaignDaily[] }) {
  // Build stacked bar chart data: each date has a bar with campaign segments
  const { chartData, campaignNames } = useMemo(() => {
    const dateMap = new Map<string, Record<string, string | number>>();
    const names = new Set<string>();

    for (const r of metaCampaigns) {
      names.add(r.campaign_name);
      const existing = dateMap.get(r.date) || { date: r.date };
      existing[r.campaign_name] = ((existing[r.campaign_name] as number) || 0) + r.spend;
      dateMap.set(r.date, existing);
    }

    const sorted = Array.from(dateMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
    return { chartData: sorted, campaignNames: Array.from(names).sort() };
  }, [metaCampaigns]);

  // Aggregate by date for table
  const dailyRows = useMemo(() => {
    const map = new Map<string, { date: string; spend: number; clicks: number; impressions: number; cv_application: number; cv_micro: number; reach: number; frequency: number; cpm: number }>();
    for (const r of metaCampaigns) {
      const ex = map.get(r.date);
      if (ex) {
        ex.spend += r.spend; ex.clicks += r.clicks; ex.impressions += r.impressions;
        ex.cv_application += r.cv_custom; ex.cv_micro += r.link_clicks;
        ex.reach += r.reach; ex.cpm = ex.impressions > 0 ? (ex.spend / ex.impressions) * 1000 : 0;
      } else {
        map.set(r.date, {
          date: r.date, spend: r.spend, clicks: r.clicks, impressions: r.impressions,
          cv_application: r.cv_custom, cv_micro: r.link_clicks,
          reach: r.reach, frequency: r.frequency, cpm: r.cpm,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [metaCampaigns]);

  const totals = useMemo(() => {
    let spend = 0, clicks = 0, impressions = 0, cvApp = 0, cvMicro = 0, reach = 0;
    for (const r of dailyRows) {
      spend += r.spend; clicks += r.clicks; impressions += r.impressions;
      cvApp += r.cv_application; cvMicro += r.cv_micro; reach += r.reach;
    }
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpa = cvApp > 0 ? spend / cvApp : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    return { spend, clicks, impressions, cvApp, cvMicro, ctr, cpa, cpm, reach, days: dailyRows.length };
  }, [dailyRows]);

  // CV trend chart data
  const cvChartData = useMemo(() => [...dailyRows].reverse(), [dailyRows]);

  return (
    <div className="space-y-6">
      {/* Daily table */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-300">日別消化状況</h3>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-4 w-28">日付</th>
                <th className="text-right py-2.5 px-3">費用</th>
                <th className="text-right py-2.5 px-3">クリック</th>
                <th className="text-right py-2.5 px-3">表示回数</th>
                <th className="text-right py-2.5 px-3">リーチ</th>
                <th className="text-right py-2.5 px-3">CTR</th>
                <th className="text-right py-2.5 px-3">CPM</th>
                <th className="text-right py-2.5 px-3">申し込み</th>
                <th className="text-right py-2.5 px-3">リンククリック</th>
                <th className="text-right py-2.5 px-3">CPA</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map(r => {
                const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
                const cpa = r.cv_application > 0 ? r.spend / r.cv_application : 0;
                const cpm = r.impressions > 0 ? (r.spend / r.impressions) * 1000 : 0;
                return (
                  <tr key={r.date} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4 text-white font-medium">{r.date}</td>
                    <td className="text-right py-2.5 px-3 text-white">{fmtYen(r.spend)}</td>
                    <td className="text-right py-2.5 px-3 text-gray-300">{r.clicks.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-gray-400">{r.impressions.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-gray-400">{r.reach.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-gray-400">{ctr.toFixed(2)}%</td>
                    <td className="text-right py-2.5 px-3 text-gray-400">{fmtYen(cpm)}</td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.cv_application > 0 ? "text-green-400 font-medium" : "text-gray-600"}>{r.cv_application.toFixed(1)}</span>
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.cv_micro > 0 ? "text-blue-400" : "text-gray-600"}>{r.cv_micro > 0 ? r.cv_micro : "—"}</span>
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-300">{cpa > 0 ? fmtYen(cpa) : "—"}</td>
                  </tr>
                );
              })}
              {dailyRows.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-gray-500">データなし</td></tr>
              )}
              {dailyRows.length > 0 && (
                <tr className="border-t border-white/20 bg-white/5 font-medium">
                  <td className="py-2.5 px-4 text-white">合計</td>
                  <td className="text-right py-2.5 px-3 text-white">{fmtYen(totals.spend)}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.clicks.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.impressions.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.reach.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.ctr.toFixed(2)}%</td>
                  <td className="text-right py-2.5 px-3 text-white">{fmtYen(totals.cpm)}</td>
                  <td className="text-right py-2.5 px-3 text-green-400">{totals.cvApp.toFixed(1)}</td>
                  <td className="text-right py-2.5 px-3 text-blue-400">{totals.cvMicro.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.cpa > 0 ? fmtYen(totals.cpa) : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CAMPAIGN TABLE (with granularity)
   ═══════════════════════════════════════════ */

function MetaCampaignTable({ metaCampaigns, granularity, setGranularity }: {
  metaCampaigns: MetaCampaignDaily[];
  granularity: AdsGranularity;
  setGranularity: (g: AdsGranularity) => void;
}) {
  const { rows, periodKeys } = useMemo(() => {
    const getPK = granularity === "daily" ? (d: string) => d
      : granularity === "weekly" ? getWeekKey : getMonthKey;

    const campMap = new Map<string, {
      name: string;
      totals: { cost: number; clicks: number; impressions: number; cv_application: number; reach: number; cpm: number };
      periods: Map<string, { cost: number; clicks: number; impressions: number; cv_application: number }>;
    }>();
    const allPKs = new Set<string>();
    const zero = () => ({ cost: 0, clicks: 0, impressions: 0, cv_application: 0 });
    const zeroTotals = () => ({ cost: 0, clicks: 0, impressions: 0, cv_application: 0, reach: 0, cpm: 0 });

    for (const r of metaCampaigns) {
      const pk = getPK(r.date);
      allPKs.add(pk);
      const ex = campMap.get(r.campaign_name);
      if (ex) {
        ex.totals.cost += r.spend; ex.totals.clicks += r.clicks;
        ex.totals.impressions += r.impressions; ex.totals.cv_application += r.cv_custom;
        ex.totals.reach += r.reach;
        const p = ex.periods.get(pk) || zero();
        p.cost += r.spend; p.clicks += r.clicks; p.impressions += r.impressions; p.cv_application += r.cv_custom;
        ex.periods.set(pk, p);
      } else {
        const t = zeroTotals();
        t.cost = r.spend; t.clicks = r.clicks; t.impressions = r.impressions; t.cv_application = r.cv_custom; t.reach = r.reach;
        const p = new Map([[pk, { cost: r.spend, clicks: r.clicks, impressions: r.impressions, cv_application: r.cv_custom }]]);
        campMap.set(r.campaign_name, { name: r.campaign_name, totals: t, periods: p });
      }
    }

    // Recalculate CPM for totals
    for (const camp of campMap.values()) {
      camp.totals.cpm = camp.totals.impressions > 0 ? (camp.totals.cost / camp.totals.impressions) * 1000 : 0;
    }

    return {
      rows: Array.from(campMap.values()).sort((a, b) => b.totals.cost - a.totals.cost),
      periodKeys: Array.from(allPKs).sort().reverse(),
    };
  }, [metaCampaigns, granularity]);

  const formatPK = (pk: string) => {
    if (granularity === "daily") return pk.slice(5);
    if (granularity === "weekly") return pk.slice(5);
    return pk;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{rows.length} キャンペーン / 選択期間</p>
        <GranularitySelector granularity={granularity} setGranularity={setGranularity} />
      </div>
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3 min-w-[200px]">キャンペーン</th>
                <th className="text-right py-2.5 px-2 w-24">合計 費用</th>
                <th className="text-right py-2.5 px-2 w-16">申し込み</th>
                <th className="text-right py-2.5 px-2 w-20">CPA</th>
                <th className="text-right py-2.5 px-2 w-16">CTR</th>
                <th className="text-right py-2.5 px-2 w-20">CPM</th>
                {periodKeys.map(pk => (
                  <th key={pk} className="text-center py-2.5 px-1 w-24 whitespace-nowrap text-[10px]">{formatPK(pk)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const cpa = r.totals.cv_application > 0 ? r.totals.cost / r.totals.cv_application : 0;
                const ctr = r.totals.impressions > 0 ? (r.totals.clicks / r.totals.impressions) * 100 : 0;
                return (
                  <tr key={r.name} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-3 text-white font-medium truncate max-w-[200px]">{r.name}</td>
                    <td className="text-right py-2.5 px-2 text-white">{fmtYen(r.totals.cost)}</td>
                    <td className="text-right py-2.5 px-2">
                      <span className={r.totals.cv_application > 0 ? "text-green-400" : "text-gray-600"}>{r.totals.cv_application.toFixed(1)}</span>
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{cpa > 0 ? fmtYen(cpa) : "—"}</td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{ctr.toFixed(2)}%</td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{fmtYen(r.totals.cpm)}</td>
                    {periodKeys.map(pk => {
                      const p = r.periods.get(pk);
                      if (!p) return <td key={pk} className="text-center py-2.5 px-1 text-gray-700">—</td>;
                      const maxCost = Math.max(...rows.map(x => x.totals.cost));
                      const intensity = maxCost > 0 ? p.cost / maxCost : 0;
                      const bg = intensity > 0.6 ? "bg-purple-500/30" : intensity > 0.3 ? "bg-purple-500/15" : intensity > 0 ? "bg-purple-500/5" : "";
                      return (
                        <td key={pk} className={`text-center py-2.5 px-1 ${bg}`} title={`費用: ${fmtYen(p.cost)} / 申込CV: ${p.cv_application.toFixed(1)}`}>
                          <span className="text-white/80 text-[10px]">{fmtYen(p.cost)}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6 + periodKeys.length} className="py-8 text-center text-gray-500">データなし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CREATIVE TAB: クリエイティブ別分析
   キャンペーン / 広告セット フィルタ付き
   ═══════════════════════════════════════════ */

type CreativeView = "ad" | "adset";

function MetaCreativeTab({ metaAdsets, metaAds, metaCampaigns }: {
  metaAdsets: MetaAdsetDaily[];
  metaAds: MetaAdDaily[];
  metaCampaigns: MetaCampaignDaily[];
}) {
  const [view, setView] = useState<CreativeView>("ad");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("__all__");
  const [selectedAdset, setSelectedAdset] = useState<string>("__all__");
  const [sortBy, setSortBy] = useState<string>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Campaign names from campaign-level data
  const campaignNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of metaCampaigns) names.add(r.campaign_name);
    return Array.from(names).sort();
  }, [metaCampaigns]);

  // Adset names filtered by selected campaign
  const adsetNames = useMemo(() => {
    const names = new Set<string>();
    const source = view === "ad" ? metaAds : metaAdsets;
    for (const r of source) {
      if (selectedCampaign !== "__all__" && r.campaign_name !== selectedCampaign) continue;
      names.add(r.adset_name);
    }
    return Array.from(names).sort();
  }, [metaAds, metaAdsets, selectedCampaign, view]);

  // Reset adset filter when campaign changes
  const handleCampaignChange = (v: string) => {
    setSelectedCampaign(v);
    setSelectedAdset("__all__");
  };

  // Aggregated data
  type AggRow = {
    name: string; campaign: string; adset: string; ad_id: string | null;
    spend: number; clicks: number; impressions: number; cv: number; link_clicks: number;
    reach: number; cpm: number;
  };

  const aggregatedData: AggRow[] = useMemo(() => {
    if (view === "adset") {
      // Aggregate adset-level
      const map = new Map<string, AggRow>();
      for (const r of metaAdsets) {
        if (selectedCampaign !== "__all__" && r.campaign_name !== selectedCampaign) continue;
        const key = `${r.campaign_name}::${r.adset_name}`;
        const ex = map.get(key);
        if (ex) {
          ex.spend += r.spend; ex.clicks += r.clicks; ex.impressions += r.impressions;
          ex.cv += r.cv_custom; ex.link_clicks += r.link_clicks; ex.reach += r.reach;
        } else {
          map.set(key, {
            name: r.adset_name, campaign: r.campaign_name, adset: r.adset_name, ad_id: null,
            spend: r.spend, clicks: r.clicks, impressions: r.impressions,
            cv: r.cv_custom, link_clicks: r.link_clicks, reach: r.reach, cpm: 0,
          });
        }
      }
      // Compute derived
      for (const row of map.values()) {
        row.cpm = row.impressions > 0 ? (row.spend / row.impressions) * 1000 : 0;
      }
      return Array.from(map.values());
    } else {
      // Aggregate ad (creative) level
      const map = new Map<string, AggRow>();
      for (const r of metaAds) {
        if (selectedCampaign !== "__all__" && r.campaign_name !== selectedCampaign) continue;
        if (selectedAdset !== "__all__" && r.adset_name !== selectedAdset) continue;
        const key = `${r.campaign_name}::${r.adset_name}::${r.ad_name}`;
        const ex = map.get(key);
        if (ex) {
          ex.spend += r.spend; ex.clicks += r.clicks; ex.impressions += r.impressions;
          ex.cv += r.cv_custom; ex.link_clicks += r.link_clicks; ex.reach += r.reach;
        } else {
          map.set(key, {
            name: r.ad_name, campaign: r.campaign_name, adset: r.adset_name, ad_id: r.ad_id,
            spend: r.spend, clicks: r.clicks, impressions: r.impressions,
            cv: r.cv_custom, link_clicks: r.link_clicks, reach: r.reach, cpm: 0,
          });
        }
      }
      for (const row of map.values()) {
        row.cpm = row.impressions > 0 ? (row.spend / row.impressions) * 1000 : 0;
      }
      return Array.from(map.values());
    }
  }, [view, metaAdsets, metaAds, selectedCampaign, selectedAdset]);

  // Sort
  const sortedData = useMemo(() => {
    const sorted = [...aggregatedData];
    sorted.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const va = (a as any)[sortBy] ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vb = (b as any)[sortBy] ?? 0;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return sorted;
  }, [aggregatedData, sortBy, sortDir]);

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const sortIcon = (col: string) => {
    if (sortBy !== col) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  };

  const noData = metaAds.length === 0 && metaAdsets.length === 0;

  if (noData) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">クリエイティブ別データはまだ収集されていません。次回のデータ同期後に表示されます。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          <button onClick={() => setView("ad")}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${view === "ad" ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
            広告（クリエイティブ）別
          </button>
          <button onClick={() => setView("adset")}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${view === "adset" ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
            広告セット別
          </button>
        </div>

        <select value={selectedCampaign} onChange={e => handleCampaignChange(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-gray-300 max-w-[300px]">
          <option value="__all__">全キャンペーン</option>
          {campaignNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        {view === "ad" && (
          <select value={selectedAdset} onChange={e => setSelectedAdset(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-gray-300 max-w-[300px]">
            <option value="__all__">全広告セット</option>
            {adsetNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}

        <span className="text-[10px] text-gray-500">{sortedData.length}件</span>
      </div>

      {/* Table */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3 min-w-[200px]">{view === "ad" ? "広告名" : "広告セット名"}</th>
                {view === "ad" && <th className="text-left py-2.5 px-3 min-w-[120px]">広告セット</th>}
                <th className="text-left py-2.5 px-3 min-w-[120px]">キャンペーン</th>
                <th className="text-right py-2.5 px-2 w-24 cursor-pointer hover:text-white" onClick={() => handleSort("spend")}>
                  費用{sortIcon("spend")}
                </th>
                <th className="text-right py-2.5 px-2 w-16 cursor-pointer hover:text-white" onClick={() => handleSort("impressions")}>
                  表示回数{sortIcon("impressions")}
                </th>
                <th className="text-right py-2.5 px-2 w-16 cursor-pointer hover:text-white" onClick={() => handleSort("clicks")}>
                  クリック{sortIcon("clicks")}
                </th>
                <th className="text-right py-2.5 px-2 w-16">CTR</th>
                <th className="text-right py-2.5 px-2 w-20 cursor-pointer hover:text-white" onClick={() => handleSort("cpm")}>
                  CPM{sortIcon("cpm")}
                </th>
                <th className="text-right py-2.5 px-2 w-16 cursor-pointer hover:text-white" onClick={() => handleSort("link_clicks")}>
                  リンククリック{sortIcon("link_clicks")}
                </th>
                <th className="text-right py-2.5 px-2 w-16 cursor-pointer hover:text-white" onClick={() => handleSort("cv")}>
                  CV{sortIcon("cv")}
                </th>
                <th className="text-right py-2.5 px-2 w-20">CPA</th>
                <th className="text-right py-2.5 px-2 w-16 cursor-pointer hover:text-white" onClick={() => handleSort("reach")}>
                  リーチ{sortIcon("reach")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((r, i) => {
                const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
                const cpa = r.cv > 0 ? r.spend / r.cv : 0;
                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-3 text-white font-medium truncate max-w-[200px]" title={r.name}>{r.name}</td>
                    {view === "ad" && <td className="py-2.5 px-3 text-gray-400 truncate max-w-[120px]" title={r.adset}>{r.adset}</td>}
                    <td className="py-2.5 px-3 text-gray-400 truncate max-w-[120px]" title={r.campaign}>{r.campaign}</td>
                    <td className="text-right py-2.5 px-2 text-white">{fmtYen(r.spend)}</td>
                    <td className="text-right py-2.5 px-2 text-gray-400">{r.impressions.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{r.clicks.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-2 text-gray-400">{ctr.toFixed(2)}%</td>
                    <td className="text-right py-2.5 px-2 text-gray-400">{fmtYen(r.cpm)}</td>
                    <td className="text-right py-2.5 px-2">
                      <span className={r.link_clicks > 0 ? "text-blue-400" : "text-gray-600"}>{r.link_clicks > 0 ? r.link_clicks.toLocaleString() : "—"}</span>
                    </td>
                    <td className="text-right py-2.5 px-2">
                      <span className={r.cv > 0 ? "text-green-400 font-medium" : "text-gray-600"}>{r.cv > 0 ? r.cv.toFixed(1) : "—"}</span>
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{cpa > 0 ? fmtYen(cpa) : "—"}</td>
                    <td className="text-right py-2.5 px-2 text-gray-400">{r.reach > 0 ? r.reach.toLocaleString() : "—"}</td>
                  </tr>
                );
              })}
              {sortedData.length === 0 && (
                <tr><td colSpan={view === "ad" ? 12 : 11} className="py-8 text-center text-gray-500">データなし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   META ADS FUNNEL ANALYSIS (CRM自社データ)
   ═══════════════════════════════════════════ */

function isKisotsu(attr: string | null): boolean {
  if (!attr) return false;
  return attr.includes("既卒") || attr.includes("中途");
}

function funnelIsClosed(stage: string | null): boolean {
  if (!stage) return false;
  return stage === "成約" || stage.startsWith("追加指導") || stage === "受講終了" || stage === "卒業";
}

function MetaFunnelTab({ metaFunnel }: { metaFunnel: AdsFunnelCustomer[] }) {
  const closedCustomers = useMemo(() => {
    return metaFunnel
      .filter(c => funnelIsClosed(c.stage))
      .sort((a, b) => (b.application_date || "").localeCompare(a.application_date || ""));
  }, [metaFunnel]);

  const kpis = useMemo(() => {
    const count = closedCustomers.length;
    const revenue = closedCustomers.reduce((s, c) => s + c.confirmed_amount + c.subsidy_amount + (!!(c.referral_category && AGENT_CATEGORIES.has(c.referral_category)) ? c.expected_referral_fee : 0), 0);
    const kisotsu = closedCustomers.filter(c => isKisotsu(c.attribute)).length;
    const shinsotsu = count - kisotsu;
    return { count, revenue, kisotsu, shinsotsu };
  }, [closedCustomers]);

  if (metaFunnel.length === 0) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">Meta広告経由の顧客データがありません（utm_source = &quot;fbad&quot; or &quot;facebook&quot;）</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="成約顧客数" value={String(kpis.count)} sub={<span className="text-gray-500 text-[10px]">広告経由</span>} />
        <KpiCard title="見込含売上合計" value={fmtYen(kpis.revenue)} sub={<span className="text-gray-500 text-[10px]">{kpis.count > 0 ? `平均: ${fmtYen(kpis.revenue / kpis.count)}` : "—"}</span>} />
        <KpiCard title="既卒系" value={String(kpis.kisotsu)} sub={<span className="text-gray-500 text-[10px]">{kpis.count > 0 ? `${((kpis.kisotsu / kpis.count) * 100).toFixed(0)}%` : "—"}</span>} />
        <KpiCard title="新卒系" value={String(kpis.shinsotsu)} sub={<span className="text-gray-500 text-[10px]">{kpis.count > 0 ? `${((kpis.shinsotsu / kpis.count) * 100).toFixed(0)}%` : "—"}</span>} />
      </div>

      {/* Customer List Table */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-300">Meta広告経由の成約顧客一覧</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">{closedCustomers.length}名</p>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-4">顧客名</th>
                <th className="text-left py-2.5 px-3">申込日</th>
                <th className="text-left py-2.5 px-3">属性</th>
                <th className="text-left py-2.5 px-3">ステージ</th>
                <th className="text-left py-2.5 px-3">キャンペーン</th>
                <th className="text-left py-2.5 px-3">メディア</th>
                <th className="text-right py-2.5 px-3">見込含売上</th>
              </tr>
            </thead>
            <tbody>
              {closedCustomers.map(c => (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2.5 px-4 text-white font-medium">{c.name}</td>
                  <td className="py-2.5 px-3 text-gray-400">{c.application_date || "—"}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${isKisotsu(c.attribute) ? "bg-blue-500/20 text-blue-300" : "bg-orange-500/20 text-orange-300"}`}>
                      {c.attribute || "—"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-300">{c.stage}</span>
                  </td>
                  <td className="py-2.5 px-3 text-gray-400 truncate max-w-[150px]">{c.utm_campaign || "—"}</td>
                  <td className="py-2.5 px-3 text-gray-400 truncate max-w-[150px]">{c.utm_medium || "—"}</td>
                  <td className="text-right py-2.5 px-3 text-white">{(() => { const agent = !!(c.referral_category && AGENT_CATEGORIES.has(c.referral_category)) ? c.expected_referral_fee : 0; const ltv = c.confirmed_amount + c.subsidy_amount + agent; return ltv > 0 ? fmtYen(ltv) : "—"; })()}</td>
                </tr>
              ))}
              {closedCustomers.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-gray-500">成約顧客なし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
