"use client";

import { useState, useMemo } from "react";
import type { MetaCampaignDaily } from "@/lib/data/analytics";
import { KpiCard, getDataDateRange } from "./shared";

interface MetaAdsTabProps {
  metaCampaigns: MetaCampaignDaily[];
}

export function MetaAdsTab({ metaCampaigns }: MetaAdsTabProps) {
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

  // Aggregate by date (daily rows)
  const dailyRows = useMemo(() => {
    const map = new Map<string, {
      date: string; spend: number; impressions: number; clicks: number;
      link_clicks: number; landing_page_views: number; cv_custom: number;
    }>();
    for (const r of filtered) {
      const ex = map.get(r.date);
      if (ex) {
        ex.spend += r.spend; ex.impressions += r.impressions; ex.clicks += r.clicks;
        ex.link_clicks += r.link_clicks; ex.landing_page_views += r.landing_page_views;
        ex.cv_custom += r.cv_custom;
      } else {
        map.set(r.date, {
          date: r.date, spend: r.spend, impressions: r.impressions, clicks: r.clicks,
          link_clicks: r.link_clicks, landing_page_views: r.landing_page_views, cv_custom: r.cv_custom,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  // Campaign breakdown
  const campaignRows = useMemo(() => {
    const map = new Map<string, {
      campaign_name: string; spend: number; impressions: number; clicks: number;
      link_clicks: number; landing_page_views: number; cv_custom: number;
    }>();
    for (const r of filtered) {
      const ex = map.get(r.campaign_name);
      if (ex) {
        ex.spend += r.spend; ex.impressions += r.impressions; ex.clicks += r.clicks;
        ex.link_clicks += r.link_clicks; ex.landing_page_views += r.landing_page_views;
        ex.cv_custom += r.cv_custom;
      } else {
        map.set(r.campaign_name, {
          campaign_name: r.campaign_name, spend: r.spend, impressions: r.impressions, clicks: r.clicks,
          link_clicks: r.link_clicks, landing_page_views: r.landing_page_views, cv_custom: r.cv_custom,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
  }, [filtered]);

  // Period totals
  const totals = useMemo(() => {
    let spend = 0, impressions = 0, clicks = 0, link_clicks = 0, landing_page_views = 0, cv_custom = 0;
    for (const r of dailyRows) {
      spend += r.spend; impressions += r.impressions; clicks += r.clicks;
      link_clicks += r.link_clicks; landing_page_views += r.landing_page_views; cv_custom += r.cv_custom;
    }
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    return { spend, impressions, clicks, link_clicks, landing_page_views, cv_custom, ctr, cpc, days: dailyRows.length };
  }, [dailyRows]);

  const [subTab, setSubTab] = useState<"daily" | "campaign">("daily");

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
      {/* Date range + sub tab */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setSubTab("daily")}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${subTab === "daily" ? "bg-brand/20 text-brand border border-brand/30" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"}`}>
            日別消化
          </button>
          <button onClick={() => setSubTab("campaign")}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${subTab === "campaign" ? "bg-brand/20 text-brand border border-brand/30" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"}`}>
            キャンペーン別
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            min={dataRange.min} max={dataRange.max}
            className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-gray-300 text-xs" />
          <span className="text-gray-500">~</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            min={dataRange.min} max={dataRange.max}
            className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-gray-300 text-xs" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-gray-500 hover:text-white text-[10px] px-1.5 py-0.5 rounded bg-white/5">リセット</button>
          )}
          <span className="text-gray-600 text-[10px]">{effectiveFrom} ~ {effectiveTo}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="合計 費用" value={`¥${Math.round(totals.spend).toLocaleString()}`} sub={<span className="text-gray-500 text-[10px]">{totals.days}日間</span>} />
        <KpiCard title="合計 クリック" value={totals.clicks.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">期間合計</span>} />
        <KpiCard title="CTR" value={`${totals.ctr.toFixed(2)}%`} sub={<span className="text-gray-500 text-[10px]">期間平均</span>} />
        <KpiCard title="CPC" value={totals.cpc > 0 ? `¥${Math.round(totals.cpc).toLocaleString()}` : "—"} sub={<span className="text-gray-500 text-[10px]">期間平均</span>} />
        <KpiCard title="リンクClick" value={totals.link_clicks.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">期間合計</span>} />
        <KpiCard title="CV (カスタム)" value={totals.cv_custom.toFixed(1)} sub={<span className="text-gray-500 text-[10px]">期間合計</span>} />
      </div>

      {/* Daily table */}
      {subTab === "daily" && (
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
                  <th className="text-right py-2.5 px-3">表示回数</th>
                  <th className="text-right py-2.5 px-3">クリック</th>
                  <th className="text-right py-2.5 px-3">CTR</th>
                  <th className="text-right py-2.5 px-3">CPC</th>
                  <th className="text-right py-2.5 px-3">リンクClick</th>
                  <th className="text-right py-2.5 px-3">LP View</th>
                  <th className="text-right py-2.5 px-3">CV</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map(r => {
                  const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
                  const cpc = r.clicks > 0 ? r.spend / r.clicks : 0;
                  return (
                    <tr key={r.date} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2.5 px-4 text-white font-medium">{r.date}</td>
                      <td className="text-right py-2.5 px-3 text-white">¥{Math.round(r.spend).toLocaleString()}</td>
                      <td className="text-right py-2.5 px-3 text-gray-400">{r.impressions.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-3 text-gray-300">{r.clicks.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-3 text-gray-400">{ctr.toFixed(2)}%</td>
                      <td className="text-right py-2.5 px-3 text-gray-400">{cpc > 0 ? `¥${Math.round(cpc).toLocaleString()}` : "—"}</td>
                      <td className="text-right py-2.5 px-3">
                        <span className={r.link_clicks > 0 ? "text-blue-400" : "text-gray-600"}>{r.link_clicks > 0 ? r.link_clicks : "—"}</span>
                      </td>
                      <td className="text-right py-2.5 px-3">
                        <span className={r.landing_page_views > 0 ? "text-cyan-400" : "text-gray-600"}>{r.landing_page_views > 0 ? r.landing_page_views : "—"}</span>
                      </td>
                      <td className="text-right py-2.5 px-3">
                        <span className={r.cv_custom > 0 ? "text-green-400 font-medium" : "text-gray-600"}>{r.cv_custom > 0 ? r.cv_custom.toFixed(1) : "—"}</span>
                      </td>
                    </tr>
                  );
                })}
                {dailyRows.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-gray-500">データなし</td></tr>
                )}
                {dailyRows.length > 0 && (
                  <tr className="border-t border-white/20 bg-white/5 font-medium">
                    <td className="py-2.5 px-4 text-white">合計</td>
                    <td className="text-right py-2.5 px-3 text-white">¥{Math.round(totals.spend).toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-white">{totals.impressions.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-white">{totals.clicks.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-white">{totals.ctr.toFixed(2)}%</td>
                    <td className="text-right py-2.5 px-3 text-white">{totals.cpc > 0 ? `¥${Math.round(totals.cpc).toLocaleString()}` : "—"}</td>
                    <td className="text-right py-2.5 px-3 text-blue-400">{totals.link_clicks.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-cyan-400">{totals.landing_page_views.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-green-400">{totals.cv_custom.toFixed(1)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Campaign breakdown table */}
      {subTab === "campaign" && (
        <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10">
            <h3 className="text-sm font-medium text-gray-300">キャンペーン別集計</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">{campaignRows.length} キャンペーン / 選択期間</p>
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-raised z-10">
                <tr className="border-b border-white/10 text-gray-400">
                  <th className="text-left py-2.5 px-4 min-w-[200px]">キャンペーン</th>
                  <th className="text-right py-2.5 px-3">費用</th>
                  <th className="text-right py-2.5 px-3">表示回数</th>
                  <th className="text-right py-2.5 px-3">クリック</th>
                  <th className="text-right py-2.5 px-3">CTR</th>
                  <th className="text-right py-2.5 px-3">CPC</th>
                  <th className="text-right py-2.5 px-3">リンクClick</th>
                  <th className="text-right py-2.5 px-3">LP View</th>
                  <th className="text-right py-2.5 px-3">CV</th>
                </tr>
              </thead>
              <tbody>
                {campaignRows.map(r => {
                  const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
                  const cpc = r.clicks > 0 ? r.spend / r.clicks : 0;
                  return (
                    <tr key={r.campaign_name} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2.5 px-4 text-white font-medium truncate max-w-[250px]">{r.campaign_name}</td>
                      <td className="text-right py-2.5 px-3 text-white">¥{Math.round(r.spend).toLocaleString()}</td>
                      <td className="text-right py-2.5 px-3 text-gray-400">{r.impressions.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-3 text-gray-300">{r.clicks.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-3 text-gray-400">{ctr.toFixed(2)}%</td>
                      <td className="text-right py-2.5 px-3 text-gray-400">{cpc > 0 ? `¥${Math.round(cpc).toLocaleString()}` : "—"}</td>
                      <td className="text-right py-2.5 px-3">
                        <span className={r.link_clicks > 0 ? "text-blue-400" : "text-gray-600"}>{r.link_clicks > 0 ? r.link_clicks : "—"}</span>
                      </td>
                      <td className="text-right py-2.5 px-3">
                        <span className={r.landing_page_views > 0 ? "text-cyan-400" : "text-gray-600"}>{r.landing_page_views > 0 ? r.landing_page_views : "—"}</span>
                      </td>
                      <td className="text-right py-2.5 px-3">
                        <span className={r.cv_custom > 0 ? "text-green-400 font-medium" : "text-gray-600"}>{r.cv_custom > 0 ? r.cv_custom.toFixed(1) : "—"}</span>
                      </td>
                    </tr>
                  );
                })}
                {campaignRows.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-gray-500">データなし</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
