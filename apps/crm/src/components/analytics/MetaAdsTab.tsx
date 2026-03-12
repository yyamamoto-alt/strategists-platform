"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { MetaCampaignDaily, AdsFunnelCustomer } from "@/lib/data/analytics";
import { SubTab, KpiCard, GranularitySelector, getDataDateRange, getWeekKey, getMonthKey } from "./shared";
import type { AdsGranularity } from "./shared";

/* ───────── Meta Ads Tab Container ───────── */
type MetaSub = "overview" | "campaigns" | "funnel";

interface MetaAdsTabProps {
  metaCampaigns: MetaCampaignDaily[];
  metaFunnel: AdsFunnelCustomer[];
}

export function MetaAdsTab({ metaCampaigns, metaFunnel }: MetaAdsTabProps) {
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
      {metaSub === "funnel" && <MetaFunnelTab metaFunnel={metaFunnel} />}
    </div>
  );
}

/* ─── Meta Daily Table + KPI (Overview) ─── */
function MetaOverview({ metaCampaigns }: { metaCampaigns: MetaCampaignDaily[] }) {
  const [selectedCampaign, setSelectedCampaign] = useState<string>("__all__");

  const campaignNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of metaCampaigns) names.add(r.campaign_name);
    return Array.from(names).sort();
  }, [metaCampaigns]);

  const filteredData = useMemo(() => {
    if (selectedCampaign === "__all__") return metaCampaigns;
    return metaCampaigns.filter(r => r.campaign_name === selectedCampaign);
  }, [metaCampaigns, selectedCampaign]);

  // Aggregate by date
  const dailyRows = useMemo(() => {
    const map = new Map<string, { date: string; spend: number; clicks: number; impressions: number; cv_application: number; cv_micro: number }>();
    for (const r of filteredData) {
      const ex = map.get(r.date);
      if (ex) {
        ex.spend += r.spend; ex.clicks += r.clicks; ex.impressions += r.impressions;
        ex.cv_application += r.cv_custom; ex.cv_micro += r.link_clicks;
      } else {
        map.set(r.date, { date: r.date, spend: r.spend, clicks: r.clicks, impressions: r.impressions, cv_application: r.cv_custom, cv_micro: r.link_clicks });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredData]);

  const totals = useMemo(() => {
    let spend = 0, clicks = 0, impressions = 0, cvApp = 0, cvMicro = 0;
    for (const r of dailyRows) {
      spend += r.spend; clicks += r.clicks; impressions += r.impressions;
      cvApp += r.cv_application; cvMicro += r.cv_micro;
    }
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpa = cvApp > 0 ? spend / cvApp : 0;
    return { spend, clicks, impressions, cvApp, cvMicro, ctr, cpa, days: dailyRows.length };
  }, [dailyRows]);

  const chartData = useMemo(() => [...dailyRows].reverse(), [dailyRows]);

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

      {/* KPI Cards — Google広告と同じ構成 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="合計 費用" value={`¥${Math.round(totals.spend).toLocaleString()}`} sub={<span className="text-gray-500 text-[10px]">期間合計</span>} />
        <KpiCard title="合計 申し込み" value={totals.cvApp.toFixed(1)} sub={<span className="text-gray-500 text-[10px]">期間合計</span>} />
        <KpiCard title="申し込みCPA" value={totals.cpa > 0 ? `¥${Math.round(totals.cpa).toLocaleString()}` : "—"} sub={<span className="text-gray-500 text-[10px]">期間平均</span>} />
        <KpiCard title="CTR" value={`${totals.ctr.toFixed(2)}%`} sub={<span className="text-gray-500 text-[10px]">期間平均</span>} />
        <KpiCard title="合計 クリック" value={totals.clicks.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">期間合計</span>} />
        <KpiCard title="合計 マイクロCV" value={totals.cvMicro.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">期間合計</span>} />
      </div>

      {/* Charts: Cost + CV trend — Google広告と同じ構成 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">広告費推移（日別）</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={(v: string) => v.slice(5)} interval={Math.max(Math.floor(chartData.length / 12), 1)} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#9ca3af" }}
                formatter={(value) => [`¥${Math.round(Number(value)).toLocaleString()}`, "広告費"]}
              />
              <Line type="monotone" dataKey="spend" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">申し込み・クリック数推移（日別）</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={(v: string) => v.slice(5)} interval={Math.max(Math.floor(chartData.length / 12), 1)} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#6b7280" }} domain={[0, (dataMax: number) => Math.max(dataMax, 5)]} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#9ca3af" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="right" type="monotone" dataKey="clicks" name="クリック" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="cv_application" name="申し込み" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily table — Google広告と同じカラム構成 */}
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
                const cpa = r.cv_application > 0 ? r.spend / r.cv_application : 0;
                return (
                  <tr key={r.date} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4 text-white font-medium">{r.date}</td>
                    <td className="text-right py-2.5 px-3 text-white">¥{Math.round(r.spend).toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-gray-300">{r.clicks.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-gray-400">{r.impressions.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-gray-400">{ctr.toFixed(2)}%</td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.cv_application > 0 ? "text-green-400 font-medium" : "text-gray-600"}>{r.cv_application.toFixed(1)}</span>
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={r.cv_micro > 0 ? "text-blue-400" : "text-gray-600"}>{r.cv_micro > 0 ? r.cv_micro : "—"}</span>
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-300">{cpa > 0 ? `¥${Math.round(cpa).toLocaleString()}` : "—"}</td>
                  </tr>
                );
              })}
              {dailyRows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-gray-500">データなし</td></tr>
              )}
              {dailyRows.length > 0 && (
                <tr className="border-t border-white/20 bg-white/5 font-medium">
                  <td className="py-2.5 px-4 text-white">合計</td>
                  <td className="text-right py-2.5 px-3 text-white">¥{Math.round(totals.spend).toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.clicks.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.impressions.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-white">{totals.ctr.toFixed(2)}%</td>
                  <td className="text-right py-2.5 px-3 text-green-400">{totals.cvApp.toFixed(1)}</td>
                  <td className="text-right py-2.5 px-3 text-blue-400">{totals.cvMicro.toLocaleString()}</td>
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

/* ─── Campaign Table (with granularity) — Google広告と同じ構成 ─── */
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
      totals: { cost: number; clicks: number; impressions: number; cv_application: number };
      periods: Map<string, { cost: number; clicks: number; impressions: number; cv_application: number }>;
    }>();
    const allPKs = new Set<string>();
    const zero = () => ({ cost: 0, clicks: 0, impressions: 0, cv_application: 0 });

    for (const r of metaCampaigns) {
      const pk = getPK(r.date);
      allPKs.add(pk);
      const ex = campMap.get(r.campaign_name);
      if (ex) {
        ex.totals.cost += r.spend; ex.totals.clicks += r.clicks;
        ex.totals.impressions += r.impressions; ex.totals.cv_application += r.cv_custom;
        const p = ex.periods.get(pk) || zero();
        p.cost += r.spend; p.clicks += r.clicks; p.impressions += r.impressions; p.cv_application += r.cv_custom;
        ex.periods.set(pk, p);
      } else {
        const t = zero();
        t.cost = r.spend; t.clicks = r.clicks; t.impressions = r.impressions; t.cv_application = r.cv_custom;
        const p = new Map([[pk, { ...t }]]);
        campMap.set(r.campaign_name, { name: r.campaign_name, totals: t, periods: p });
      }
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
                <th className="text-right py-2.5 px-2 w-20">合計 費用</th>
                <th className="text-right py-2.5 px-2 w-16">合計 申し込み</th>
                <th className="text-right py-2.5 px-2 w-16">CPA</th>
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
                      const bg = intensity > 0.6 ? "bg-purple-500/30" : intensity > 0.3 ? "bg-purple-500/15" : intensity > 0 ? "bg-purple-500/5" : "";
                      return (
                        <td key={pk} className={`text-center py-2.5 px-1 ${bg}`} title={`費用: ¥${Math.round(p.cost).toLocaleString()} / 申込CV: ${p.cv_application.toFixed(1)}`}>
                          <span className="text-white/80 text-[10px]">¥{p.cost >= 1000 ? `${(p.cost/1000).toFixed(0)}k` : Math.round(p.cost)}</span>
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
    const revenue = closedCustomers.reduce((s, c) => s + c.confirmed_amount + c.expected_referral_fee, 0);
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
        <KpiCard title="見込含売上合計" value={`¥${Math.round(kpis.revenue).toLocaleString()}`} sub={<span className="text-gray-500 text-[10px]">{kpis.count > 0 ? `平均: ¥${Math.round(kpis.revenue / kpis.count).toLocaleString()}` : "—"}</span>} />
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
                  <td className="text-right py-2.5 px-3 text-white">{(c.confirmed_amount + c.expected_referral_fee) > 0 ? `¥${Math.round(c.confirmed_amount + c.expected_referral_fee).toLocaleString()}` : "—"}</td>
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
