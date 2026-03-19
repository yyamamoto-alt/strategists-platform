"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { AdsCampaignDaily, AdsKeywordDaily, AdsFunnelCustomer, AdsGranularity } from "./shared";
import { AGENT_CATEGORIES } from "@/lib/calc-fields";
import {
  getWeekKey,
  getMonthKey,
  SubTab,
  KpiCard,
  GranularitySelector,
  getDataDateRange,
} from "./shared";

/* ───────── Ads Tab Container ───────── */
type AdsSub = "overview" | "campaigns" | "keywords" | "funnel";

interface AdsTabProps {
  adsCampaigns: AdsCampaignDaily[];
  adsKeywords: AdsKeywordDaily[];
  adsFunnel: AdsFunnelCustomer[];
}

export function AdsTab({ adsCampaigns, adsKeywords, adsFunnel }: AdsTabProps) {
  const [granularity, setGranularity] = useState<AdsGranularity>("weekly");
  const [adsSub, setAdsSub] = useState<AdsSub>("overview");

  // Date range filter — draft values for picker, applied on button click
  const dataRange = useMemo(() => getDataDateRange(adsCampaigns), [adsCampaigns]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  // Filter campaigns/keywords by date range
  const filteredCampaigns = useMemo(() => {
    const from = dateFrom || dataRange.min;
    const to = dateTo || dataRange.max;
    if (!from || !to) return adsCampaigns;
    return adsCampaigns.filter(r => r.date >= from && r.date <= to);
  }, [adsCampaigns, dateFrom, dateTo, dataRange]);

  const filteredKeywords = useMemo(() => {
    const from = dateFrom || dataRange.min;
    const to = dateTo || dataRange.max;
    if (!from || !to) return adsKeywords;
    return adsKeywords.filter(r => r.date >= from && r.date <= to);
  }, [adsKeywords, dateFrom, dateTo, dataRange]);

  if (adsCampaigns.length === 0) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">Google Ads データはまだ収集中です。バックフィル完了後に表示されます。</p>
      </div>
    );
  }

  const effectiveFrom = dateFrom || dataRange.min;
  const effectiveTo = dateTo || dataRange.max;

  return (
    <div className="space-y-4">
      {/* Sub tabs + Date range picker (統合) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <SubTab label="日別消化" active={adsSub === "overview"} onClick={() => setAdsSub("overview")} />
          <SubTab label="キャンペーン別" active={adsSub === "campaigns"} onClick={() => setAdsSub("campaigns")} />
          <SubTab label="キーワード別" active={adsSub === "keywords"} onClick={() => setAdsSub("keywords")} />
          <SubTab label="成約顧客リスト" active={adsSub === "funnel"} onClick={() => setAdsSub("funnel")} />
        </div>
        {adsSub !== "funnel" && (
          <div className="flex items-center gap-2 text-xs">
            <input type="date" value={draftFrom || dateFrom || effectiveFrom} onChange={e => setDraftFrom(e.target.value)}
              min={dataRange.min} max={dataRange.max}
              className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-gray-300 text-xs" />
            <span className="text-gray-500">〜</span>
            <input type="date" value={draftTo || dateTo || effectiveTo} onChange={e => setDraftTo(e.target.value)}
              min={dataRange.min} max={dataRange.max}
              className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-gray-300 text-xs" />
            <button onClick={() => { setDateFrom(draftFrom || dateFrom || effectiveFrom); setDateTo(draftTo || dateTo || effectiveTo); setDraftFrom(""); setDraftTo(""); }}
              className="text-white text-[10px] px-2 py-0.5 rounded bg-brand hover:bg-brand/80 font-medium">適用</button>
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); setDraftFrom(""); setDraftTo(""); }}
                className="text-gray-500 hover:text-white text-[10px] px-1.5 py-0.5 rounded bg-white/5">リセット</button>
            )}
          </div>
        )}
      </div>
      {adsSub === "overview" && <AdsOverview adsCampaigns={filteredCampaigns} />}
      {adsSub === "campaigns" && <AdsCampaignTable adsCampaigns={filteredCampaigns} granularity={granularity} setGranularity={setGranularity} />}
      {adsSub === "keywords" && <AdsKeywordTable adsKeywords={filteredKeywords} granularity={granularity} setGranularity={setGranularity} />}
      {adsSub === "funnel" && <AdsFunnelTab adsFunnel={adsFunnel} />}
    </div>
  );
}

/* ─── Ads Daily Table + KPI (Overview) ─── */
function AdsOverview({ adsCampaigns }: { adsCampaigns: AdsCampaignDaily[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState<string>("__all__");

  // Campaign list
  const campaignNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of adsCampaigns) names.add(r.campaign_name);
    return Array.from(names).sort();
  }, [adsCampaigns]);

  // Filter by campaign
  const filtered = useMemo(() => {
    if (selectedCampaign === "__all__") return adsCampaigns;
    return adsCampaigns.filter(r => r.campaign_name === selectedCampaign);
  }, [adsCampaigns, selectedCampaign]);

  // Aggregate by date (daily rows)
  const dailyRows = useMemo(() => {
    const map = new Map<string, { date: string; cost: number; clicks: number; impressions: number; cv_application: number; cv_micro: number }>();
    for (const r of filtered) {
      const ex = map.get(r.date);
      if (ex) {
        ex.cost += r.cost; ex.clicks += r.clicks; ex.impressions += r.impressions;
        ex.cv_application += r.cv_application; ex.cv_micro += r.cv_micro;
      } else {
        map.set(r.date, { date: r.date, cost: r.cost, clicks: r.clicks, impressions: r.impressions, cv_application: r.cv_application, cv_micro: r.cv_micro });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  // Period totals (for KPI)
  const totals = useMemo(() => {
    let cost = 0, clicks = 0, impressions = 0, cvApp = 0, cvMicro = 0;
    for (const r of dailyRows) {
      cost += r.cost; clicks += r.clicks; impressions += r.impressions;
      cvApp += r.cv_application; cvMicro += r.cv_micro;
    }
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpa = cvApp > 0 ? cost / cvApp : 0;
    return { cost, clicks, impressions, cvApp, cvMicro, ctr, cpa, days: dailyRows.length };
  }, [dailyRows]);

  // Chart data (ascending for charts) — stacked by campaign
  const CAMPAIGN_COLORS = ["#FBBC04", "#4285F4", "#EA4335", "#34A853", "#FF6D01", "#46BDC6", "#AB47BC", "#7CB342"];
  const { stackedChartData, chartCampaigns } = useMemo(() => {
    // Aggregate by date x campaign
    const dateMap = new Map<string, Record<string, number>>();
    const campSet = new Set<string>();
    for (const r of (selectedCampaign === "__all__" ? adsCampaigns : adsCampaigns.filter(c => c.campaign_name === selectedCampaign))) {
      campSet.add(r.campaign_name);
      const ex = dateMap.get(r.date) || {};
      ex[r.campaign_name] = (ex[r.campaign_name] || 0) + r.cost;
      dateMap.set(r.date, ex);
    }
    const camps = Array.from(campSet).sort();
    const data = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
    return { stackedChartData: data, chartCampaigns: camps };
  }, [adsCampaigns, selectedCampaign]);

  // Application bar chart data
  const appChartData = useMemo(() => [...dailyRows].reverse(), [dailyRows]);

  return (
    <div className="space-y-6">
      {/* Campaign filter */}
      <div className="flex items-center gap-3">
        <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-gray-300 max-w-[400px]">
          <option value="__all__">全キャンペーン</option>
          {campaignNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="text-gray-600 text-[10px]">{totals.days}日間</span>
      </div>

      {/* KPI Cards — period totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="広告費用" value={`¥${Math.round(totals.cost).toLocaleString()}`} sub={<span className="text-gray-500 text-[10px]">{totals.days}日間合計</span>} />
        <KpiCard title="申し込み数" value={totals.cvApp.toFixed(1)} sub={<span className="text-gray-500 text-[10px]">{totals.days}日間合計</span>} />
        <KpiCard title="確定CPA（申込ベース）" value={totals.cpa > 0 ? `¥${Math.round(totals.cpa).toLocaleString()}` : "—"} sub={<span className="text-gray-500 text-[10px]">{totals.days}日間平均</span>} />
        <KpiCard title="CTR" value={`${totals.ctr.toFixed(2)}%`} sub={<span className="text-gray-500 text-[10px]">{totals.days}日間平均</span>} />
        <KpiCard title="クリック数" value={totals.clicks.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">{totals.days}日間合計</span>} />
        <KpiCard title="マイクロCV" value={totals.cvMicro.toFixed(0)} sub={<span className="text-gray-500 text-[10px]">{totals.days}日間合計</span>} />
      </div>

      {/* Charts: Cost by campaign (stacked bar) + Applications (bar) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">広告費推移 キャンペーン別（日別）</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stackedChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={(v: string) => v.slice(5)} interval={Math.max(Math.floor(stackedChartData.length / 12), 1)} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={(v: number) => v >= 10000 ? `${(v/10000).toFixed(1)}万` : `¥${Math.round(v)}`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#9ca3af" }}
                formatter={(value) => [`¥${Math.round(Number(value)).toLocaleString()}`, "費用"]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {chartCampaigns.map((camp, i) => (
                <Bar key={camp} dataKey={camp} stackId="cost" fill={CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length]}
                  name={camp.length > 20 ? camp.slice(0, 18) + "…" : camp} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-1">申し込み数・クリック数（日別）</h3>
          <p className="text-[10px] text-gray-600 mb-3">※ Google Ads APIのコンバージョンデータ（既卒schedule遷移）</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={appChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={(v: string) => v.slice(5)} interval={Math.max(Math.floor(appChartData.length / 12), 1)} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#6b7280" }} domain={[0, (dataMax: number) => Math.max(dataMax, 5)]} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#9ca3af" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="right" dataKey="clicks" name="クリック数" fill="#4285F4" opacity={0.6} />
              <Bar yAxisId="left" dataKey="cv_application" name="申込数" fill="#34A853" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily table — rows=dates, columns=metrics */}
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
                <th className="text-right py-2.5 px-3">CTR</th>
                <th className="text-right py-2.5 px-3">申し込み</th>
                <th className="text-right py-2.5 px-3">マイクロCV</th>
                <th className="text-right py-2.5 px-3">CPA</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map(r => {
                const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
                const cpa = r.cv_application > 0 ? r.cost / r.cv_application : 0;
                return (
                  <tr key={r.date} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4 text-white font-medium">{r.date}</td>
                    <td className="text-right py-2.5 px-3 text-white">¥{Math.round(r.cost).toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-gray-300">{r.clicks.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-gray-400">{r.impressions.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-gray-400">{ctr.toFixed(2)}%</td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.cv_application > 0 ? "text-green-400 font-medium" : "text-gray-600"}>{r.cv_application.toFixed(1)}</span>
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.cv_micro > 0 ? "text-blue-400" : "text-gray-600"}>{r.cv_micro.toFixed(0)}</span>
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-300">{cpa > 0 ? `¥${Math.round(cpa).toLocaleString()}` : "—"}</td>
                  </tr>
                );
              })}
              {dailyRows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-gray-500">データなし</td></tr>
              )}
              {/* Totals row */}
              {dailyRows.length > 0 && (
                <tr className="border-t border-white/20 bg-white/5 font-medium">
                  <td className="py-2.5 px-4 text-white">合計</td>
                  <td className="text-right py-2.5 px-3 text-white">¥{Math.round(totals.cost).toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.clicks.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.impressions.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.ctr.toFixed(2)}%</td>
                  <td className="text-right py-2.5 px-3 text-green-400">{totals.cvApp.toFixed(1)}</td>
                  <td className="text-right py-2.5 px-3 text-blue-400">{totals.cvMicro.toFixed(0)}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.cpa > 0 ? `¥${Math.round(totals.cpa).toLocaleString()}` : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Campaign Table (with granularity) ─── */
function fmtCostCompact(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return `¥${Math.round(v).toLocaleString()}`;
}

function AdsCampaignTable({ adsCampaigns, granularity, setGranularity }: {
  adsCampaigns: AdsCampaignDaily[];
  granularity: AdsGranularity;
  setGranularity: (g: AdsGranularity) => void;
}) {
  const [showInactive, setShowInactive] = useState(false);

  const { allRows, periodKeys } = useMemo(() => {
    const getPK = granularity === "daily" ? (d: string) => d
      : granularity === "weekly" ? getWeekKey : getMonthKey;

    // Group by campaign x period
    const campMap = new Map<string, {
      name: string;
      totals: { cost: number; clicks: number; impressions: number; cv_application: number };
      periods: Map<string, { cost: number; clicks: number; impressions: number; cv_application: number }>;
    }>();
    const allPKs = new Set<string>();
    const zero = () => ({ cost: 0, clicks: 0, impressions: 0, cv_application: 0 });

    for (const r of adsCampaigns) {
      const pk = getPK(r.date);
      allPKs.add(pk);
      const ex = campMap.get(r.campaign_name);
      if (ex) {
        ex.totals.cost += r.cost; ex.totals.clicks += r.clicks;
        ex.totals.impressions += r.impressions; ex.totals.cv_application += r.cv_application;
        const p = ex.periods.get(pk) || zero();
        p.cost += r.cost; p.clicks += r.clicks; p.impressions += r.impressions; p.cv_application += r.cv_application;
        ex.periods.set(pk, p);
      } else {
        const t = zero();
        t.cost = r.cost; t.clicks = r.clicks; t.impressions = r.impressions; t.cv_application = r.cv_application;
        const p = new Map([[pk, { ...t }]]);
        campMap.set(r.campaign_name, { name: r.campaign_name, totals: t, periods: p });
      }
    }

    return {
      allRows: Array.from(campMap.values()).sort((a, b) => b.totals.cost - a.totals.cost),
      periodKeys: Array.from(allPKs).sort().reverse(),
    };
  }, [adsCampaigns, granularity]);

  // Filter: hide campaigns with zero cost in last 28 days
  const rows = useMemo(() => {
    if (showInactive) return allRows;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 28);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return allRows.filter(r => {
      // Check if campaign had any cost in recent 28 days from original data
      let recentCost = 0;
      for (const [pk, p] of r.periods) {
        if (pk >= cutoffStr) recentCost += p.cost;
      }
      return recentCost > 0;
    });
  }, [allRows, showInactive]);

  const inactiveCount = allRows.length - rows.length;

  const formatPK = (pk: string) => {
    if (granularity === "daily") return pk.slice(5); // MM-DD
    if (granularity === "weekly") return pk.slice(5); // MM-DD (week start)
    return pk; // YYYY-MM
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">{rows.length} キャンペーン{!showInactive && inactiveCount > 0 ? ` （${inactiveCount}件非表示）` : ""}</p>
          {inactiveCount > 0 && (
            <button onClick={() => setShowInactive(!showInactive)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${showInactive ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-white/10 bg-white/5 text-gray-500 hover:text-gray-300"}`}>
              {showInactive ? "停止中を非表示" : "停止中も表示"}
            </button>
          )}
        </div>
        <GranularitySelector granularity={granularity} setGranularity={setGranularity} />
      </div>
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3 min-w-[200px]">キャンペーン</th>
                <th className="text-right py-2.5 px-2 w-20">合計費用</th>
                <th className="text-right py-2.5 px-2 w-16">申込数</th>
                <th className="text-right py-2.5 px-2 w-16">確定CPA</th>
                <th className="text-right py-2.5 px-2 w-16">CTR</th>
                {periodKeys.map(pk => (
                  <th key={pk} className="text-center py-2.5 px-1 w-20 whitespace-nowrap text-[10px]">{formatPK(pk)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const cpa = r.totals.cv_application > 0 ? r.totals.cost / r.totals.cv_application : 0;
                const ctr = r.totals.impressions > 0 ? (r.totals.clicks / r.totals.impressions) * 100 : 0;
                const maxCost = Math.max(...rows.map(x => x.totals.cost));
                return (
                  <tr key={r.name} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-3 text-white font-medium truncate max-w-[200px]">{r.name}</td>
                    <td className="text-right py-2.5 px-2 text-white">¥{Math.round(r.totals.cost).toLocaleString()}</td>
                    <td className="text-right py-2.5 px-2">
                      <span className={r.totals.cv_application > 0 ? "text-green-400" : "text-gray-600"}>{r.totals.cv_application.toFixed(1)}</span>
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{cpa > 0 ? `¥${Math.round(cpa).toLocaleString()}` : "—"}</td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{ctr.toFixed(2)}%</td>
                    {periodKeys.map(pk => {
                      const p = r.periods.get(pk);
                      if (!p) return <td key={pk} className="text-center py-2.5 px-1 text-gray-700">—</td>;
                      const intensity = maxCost > 0 ? p.cost / maxCost : 0;
                      const bg = intensity > 0.6 ? "bg-amber-500/30" : intensity > 0.3 ? "bg-amber-500/15" : intensity > 0 ? "bg-amber-500/5" : "";
                      return (
                        <td key={pk} className={`text-center py-2.5 px-1 ${bg}`} title={`費用: ¥${Math.round(p.cost).toLocaleString()} / 申込CV: ${p.cv_application.toFixed(1)}`}>
                          <span className="text-white/80 text-[10px]">{fmtCostCompact(p.cost)}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={5 + periodKeys.length} className="py-8 text-center text-gray-500">データなし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Keyword Table (with granularity) ─── */
function AdsKeywordTable({ adsKeywords, granularity, setGranularity }: {
  adsKeywords: AdsKeywordDaily[];
  granularity: AdsGranularity;
  setGranularity: (g: AdsGranularity) => void;
}) {
  const [sortBy, setSortBy] = useState<"cost" | "clicks" | "cv_application" | "impressions">("cost");

  const keywords = useMemo(() => {
    const map = new Map<string, {
      keyword: string; campaign: string; matchType: string;
      cost: number; clicks: number; impressions: number; cv_application: number;
    }>();

    for (const r of adsKeywords) {
      const key = `${r.keyword}|${r.match_type}|${r.campaign_name}`;
      const ex = map.get(key);
      if (ex) {
        ex.cost += r.cost; ex.clicks += r.clicks; ex.impressions += r.impressions; ex.cv_application += r.cv_application;
      } else {
        map.set(key, {
          keyword: r.keyword, campaign: r.campaign_name, matchType: r.match_type,
          cost: r.cost, clicks: r.clicks, impressions: r.impressions, cv_application: r.cv_application,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b[sortBy] - a[sortBy]);
  }, [adsKeywords, sortBy]);

  // Period-level data for the table
  const { periodData, periodKeys } = useMemo(() => {
    const getPK = granularity === "daily" ? (d: string) => d
      : granularity === "weekly" ? getWeekKey : getMonthKey;

    const allPKs = new Set<string>();
    const data = new Map<string, Map<string, { cost: number; clicks: number; cv_application: number }>>();

    for (const r of adsKeywords) {
      const pk = getPK(r.date);
      allPKs.add(pk);
      const kwKey = `${r.keyword}|${r.match_type}|${r.campaign_name}`;
      if (!data.has(kwKey)) data.set(kwKey, new Map());
      const periods = data.get(kwKey)!;
      const ex = periods.get(pk) || { cost: 0, clicks: 0, cv_application: 0 };
      ex.cost += r.cost; ex.clicks += r.clicks; ex.cv_application += r.cv_application;
      periods.set(pk, ex);
    }

    return { periodData: data, periodKeys: Array.from(allPKs).sort().reverse() };
  }, [adsKeywords, granularity]);

  const formatPK = (pk: string) => {
    if (granularity === "daily") return pk.slice(5);
    if (granularity === "weekly") return pk.slice(5);
    return pk;
  };

  const matchBadge = (mt: string) => {
    const c: Record<string, string> = {
      EXACT: "bg-blue-500/20 text-blue-300",
      PHRASE: "bg-purple-500/20 text-purple-300",
      BROAD: "bg-gray-500/20 text-gray-400",
    };
    const tooltips: Record<string, string> = {
      EXACT: "完全一致: 検索語と完全に一致する場合のみ広告表示",
      PHRASE: "フレーズ一致: 検索語にキーワードの意味が含まれる場合に広告表示",
      BROAD: "部分一致: 検索語がキーワードに関連する場合に広告表示（最も広い）",
    };
    return <span className={`px-1.5 py-0.5 rounded text-[10px] cursor-help ${c[mt] || c.BROAD}`} title={tooltips[mt] || ""}>{mt}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{keywords.length} キーワード / 選択期間</p>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {(["cost", "clicks", "cv_application", "impressions"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`px-2 py-1 text-[10px] rounded-md transition-colors ${sortBy === s ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                {s === "cost" ? "費用順" : s === "clicks" ? "クリック順" : s === "cv_application" ? "CV順" : "表示順"}
              </button>
            ))}
          </div>
          <GranularitySelector granularity={granularity} setGranularity={setGranularity} />
        </div>
      </div>
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3">マッチ</th>
                <th className="text-left py-2.5 px-3 min-w-[180px]">キーワード</th>
                <th className="text-left py-2.5 px-3 max-w-[150px]">キャンペーン</th>
                <th className="text-right py-2.5 px-2 w-16">費用</th>
                <th className="text-right py-2.5 px-2 w-14">Click</th>
                <th className="text-right py-2.5 px-2 w-14">表示</th>
                <th className="text-right py-2.5 px-2 w-12">CTR</th>
                <th className="text-right py-2.5 px-2 w-10">申し込み</th>
                {periodKeys.slice(-12).map(pk => (
                  <th key={pk} className="text-center py-2.5 px-1 w-14 whitespace-nowrap text-[10px]">{formatPK(pk)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keywords.slice(0, 100).map((k) => {
                const ctr = k.impressions > 0 ? (k.clicks / k.impressions) * 100 : 0;
                const kwKey = `${k.keyword}|${k.matchType}|${k.campaign}`;
                const kwPeriods = periodData.get(kwKey);
                return (
                  <tr key={kwKey} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 px-3">{matchBadge(k.matchType)}</td>
                    <td className="py-2 px-3 text-white font-medium">{k.keyword}</td>
                    <td className="py-2 px-3 text-gray-400 truncate max-w-[150px]">{k.campaign}</td>
                    <td className="text-right py-2 px-2 text-white">¥{Math.round(k.cost).toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-gray-300">{k.clicks.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{k.impressions.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{ctr.toFixed(1)}%</td>
                    <td className="text-right py-2 px-2">
                      <span className={k.cv_application > 0 ? "text-green-400 font-medium" : "text-gray-600"}>{k.cv_application.toFixed(1)}</span>
                    </td>
                    {periodKeys.slice(-12).map(pk => {
                      const p = kwPeriods?.get(pk);
                      if (!p) return <td key={pk} className="text-center py-2 px-1 text-gray-700">—</td>;
                      return (
                        <td key={pk} className="text-center py-2 px-1" title={`費用: ¥${Math.round(p.cost).toLocaleString()}`}>
                          <span className={p.cv_application > 0 ? "text-green-400 text-[10px]" : "text-white/60 text-[10px]"}>
                            {p.clicks > 0 ? p.clicks : "—"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {keywords.length === 0 && <tr><td colSpan={8 + Math.min(periodKeys.length, 12)} className="py-8 text-center text-gray-500">データなし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   GOOGLE ADS FUNNEL ANALYSIS (CRM自社データ)
   ═══════════════════════════════════════════ */

function isKisotsu(attr: string | null): boolean {
  if (!attr) return false;
  return attr.includes("既卒") || attr.includes("中途");
}

const FUNNEL_NOT_CONDUCTED = new Set(["日程未確", "未実施", "実施不可", "キャンセル", "NoShow"]);
function funnelIsClosed(stage: string | null): boolean {
  if (!stage) return false;
  return stage === "成約" || stage.startsWith("追加指導") || stage === "受講終了" || stage === "卒業";
}

function AdsFunnelTab({ adsFunnel }: { adsFunnel: AdsFunnelCustomer[] }) {
  const closedCustomers = useMemo(() => {
    return adsFunnel
      .filter(c => funnelIsClosed(c.stage))
      .sort((a, b) => (b.application_date || "").localeCompare(a.application_date || ""));
  }, [adsFunnel]);

  const kpis = useMemo(() => {
    const count = closedCustomers.length;
    const revenue = closedCustomers.reduce((s, c) => s + c.confirmed_amount + c.subsidy_amount + (!!(c.referral_category && AGENT_CATEGORIES.has(c.referral_category)) ? c.expected_referral_fee : 0), 0);
    const kisotsu = closedCustomers.filter(c => isKisotsu(c.attribute)).length;
    const shinsotsu = count - kisotsu;
    return { count, revenue, kisotsu, shinsotsu };
  }, [closedCustomers]);

  if (adsFunnel.length === 0) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">Google Ads経由の顧客データがありません（utm_source = &quot;googleads&quot;）</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="成約顧客数" value={String(kpis.count)} sub={<span className="text-gray-500 text-[10px]">広告経由</span>} />
        <KpiCard title="見込含売上合計" value={`¥${Math.round(kpis.revenue).toLocaleString()}`} sub={<span className="text-gray-500 text-[10px]">{kpis.count > 0 ? `平均: ¥${Math.round(kpis.revenue / kpis.count).toLocaleString()}` : "—"}</span>} />
        <KpiCard title="既卒系" value={String(kpis.kisotsu)} sub={<span className="text-gray-500 text-[10px]">{kpis.count > 0 ? `${((kpis.kisotsu / kpis.count) * 100).toFixed(0)}%` : "—"}</span>} />
        <KpiCard title="新卒系" value={String(kpis.shinsotsu)} sub={<span className="text-gray-500 text-[10px]">{kpis.count > 0 ? `${((kpis.shinsotsu / kpis.count) * 100).toFixed(0)}%` : "—"}</span>} />
      </div>

      {/* Customer List Table */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-300">広告経由の成約顧客一覧</h3>
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
                  <td className="text-right py-2.5 px-3 text-white">{(() => { const agent = !!(c.referral_category && AGENT_CATEGORIES.has(c.referral_category)) ? c.expected_referral_fee : 0; const ltv = c.confirmed_amount + c.subsidy_amount + agent; return ltv > 0 ? `¥${Math.round(ltv).toLocaleString()}` : "—"; })()}</td>
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
