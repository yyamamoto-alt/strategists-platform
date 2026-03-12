import { fetchMetaCampaignDaily } from "@/lib/data/analytics";
import { MetaAdsSummaryClient, type MetaAdsRow } from "./meta-ads-client";

/** 週キーを算出（月曜始まり） */
function weekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

const ADS_START = "2025-08";

export async function MetaAdsSection() {
  const campaigns = await fetchMetaCampaignDaily(180);

  // --- 週次集計 ---
  const weeklyMap = new Map<string, {
    spend: number; impressions: number; clicks: number;
    link_clicks: number; landing_page_views: number; cv_custom: number;
  }>();
  for (const r of campaigns) {
    const wk = weekKey(r.date);
    const ex = weeklyMap.get(wk);
    if (ex) {
      ex.spend += r.spend;
      ex.impressions += r.impressions;
      ex.clicks += r.clicks;
      ex.link_clicks += r.link_clicks;
      ex.landing_page_views += r.landing_page_views;
      ex.cv_custom += r.cv_custom;
    } else {
      weeklyMap.set(wk, {
        spend: r.spend, impressions: r.impressions, clicks: r.clicks,
        link_clicks: r.link_clicks, landing_page_views: r.landing_page_views, cv_custom: r.cv_custom,
      });
    }
  }

  // --- 月次集計 ---
  const monthlyMap = new Map<string, {
    spend: number; impressions: number; clicks: number;
    link_clicks: number; landing_page_views: number; cv_custom: number;
  }>();
  for (const r of campaigns) {
    const mk = monthKey(r.date);
    const ex = monthlyMap.get(mk);
    if (ex) {
      ex.spend += r.spend;
      ex.impressions += r.impressions;
      ex.clicks += r.clicks;
      ex.link_clicks += r.link_clicks;
      ex.landing_page_views += r.landing_page_views;
      ex.cv_custom += r.cv_custom;
    } else {
      monthlyMap.set(mk, {
        spend: r.spend, impressions: r.impressions, clicks: r.clicks,
        link_clicks: r.link_clicks, landing_page_views: r.landing_page_views, cv_custom: r.cv_custom,
      });
    }
  }

  function toRows(map: Map<string, { spend: number; impressions: number; clicks: number; link_clicks: number; landing_page_views: number; cv_custom: number }>): MetaAdsRow[] {
    return Array.from(map.entries())
      .filter(([k]) => k >= ADS_START)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([period, v]) => ({
        period,
        spend: Math.round(v.spend),
        impressions: v.impressions,
        clicks: v.clicks,
        ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
        cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
        link_clicks: v.link_clicks,
        landing_page_views: v.landing_page_views,
        cv_custom: v.cv_custom,
      }));
  }

  return (
    <MetaAdsSummaryClient
      weeklyRows={toRows(weeklyMap)}
      monthlyRows={toRows(monthlyMap)}
    />
  );
}
