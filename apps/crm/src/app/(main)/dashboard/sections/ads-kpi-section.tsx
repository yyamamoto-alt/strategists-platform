import { fetchAdsCampaignDaily, fetchMetaCampaignDaily } from "@/lib/data/analytics";
import { AdsKpiClient } from "./ads-kpi-client";

export interface DailyKpi {
  date: string;
  cost: number;
  clicks: number;
  cpc: number;
  conversions: number;
}

/** キャンペーン別日別データ */
export interface DailyKpiWithCampaigns extends DailyKpi {
  /** キャンペーン名 → 広告費 */
  campaignCosts: Record<string, number>;
}

// 検索キャンペーン判定（SEARCH = 完全一致/複製版等）
const SEARCH_CAMPAIGN_NAMES = [
  "完全一致",
  "複製版",
  "ケース面接対策",
  "戦コン",
  "マッキンゼー",
  "セミナー",
  "フェルミ推定動画",
];

function isSearchCampaign(name: string): boolean {
  return SEARCH_CAMPAIGN_NAMES.some((s) => name.includes(s));
}

export async function AdsKpiSection() {
  const [googleRaw, metaRaw] = await Promise.all([
    fetchAdsCampaignDaily(90),
    fetchMetaCampaignDaily(90),
  ]);

  // Google: 日別にキャンペーン別コストを保持
  const googleByDate = new Map<string, DailyKpiWithCampaigns>();
  for (const r of googleRaw) {
    const isSearch = isSearchCampaign(r.campaign_name);
    const category = isSearch ? "検索広告" : "その他";
    const ex = googleByDate.get(r.date);
    if (ex) {
      ex.cost += r.cost;
      ex.clicks += r.clicks;
      ex.conversions += r.cv_application;
      ex.campaignCosts[category] = (ex.campaignCosts[category] || 0) + r.cost;
    } else {
      googleByDate.set(r.date, {
        date: r.date,
        cost: r.cost,
        clicks: r.clicks,
        cpc: 0,
        conversions: r.cv_application,
        campaignCosts: { [category]: r.cost },
      });
    }
  }
  const googleDaily: DailyKpiWithCampaigns[] = Array.from(googleByDate.values())
    .map((d) => ({ ...d, cpc: d.clicks > 0 ? Math.round(d.cost / d.clicks) : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Meta: 日別にキャンペーン別コストを保持
  const metaByDate = new Map<string, DailyKpiWithCampaigns>();
  for (const r of metaRaw) {
    const ex = metaByDate.get(r.date);
    if (ex) {
      ex.cost += r.spend;
      ex.clicks += r.clicks;
      ex.conversions += r.cv_custom;
      ex.campaignCosts[r.campaign_name] = (ex.campaignCosts[r.campaign_name] || 0) + r.spend;
    } else {
      metaByDate.set(r.date, {
        date: r.date,
        cost: r.spend,
        clicks: r.clicks,
        cpc: 0,
        conversions: r.cv_custom,
        campaignCosts: { [r.campaign_name]: r.spend },
      });
    }
  }
  const metaDaily: DailyKpiWithCampaigns[] = Array.from(metaByDate.values())
    .map((d) => ({ ...d, cpc: d.clicks > 0 ? Math.round(d.cost / d.clicks) : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 全キャンペーン名を収集
  const googleCategories = ["検索広告", "その他"];
  const metaCampaignNames = Array.from(
    new Set(metaRaw.map((r) => r.campaign_name))
  ).sort();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <AdsKpiClient
        title="Google広告 KPI"
        data={googleDaily}
        campaignNames={googleCategories}
        defaultSearchOnly={true}
        searchFilterLabel="検索広告のみ"
      />
      <AdsKpiClient
        title="Meta広告 KPI"
        data={metaDaily}
        campaignNames={metaCampaignNames}
      />
    </div>
  );
}
