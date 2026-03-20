import { fetchAdsCampaignDaily, fetchMetaCampaignDaily } from "@/lib/data/analytics";
import { AdsKpiClient } from "./ads-kpi-client";

export interface DailyKpi {
  date: string;
  cost: number;
  clicks: number;
  cpc: number;
  conversions: number;
}

export async function AdsKpiSection() {
  const [googleRaw, metaRaw] = await Promise.all([
    fetchAdsCampaignDaily(90),
    fetchMetaCampaignDaily(90),
  ]);

  // Google: 日別に集計（複数キャンペーンを合算）
  const googleByDate = new Map<string, DailyKpi>();
  for (const r of googleRaw) {
    const ex = googleByDate.get(r.date);
    if (ex) {
      ex.cost += r.cost;
      ex.clicks += r.clicks;
      ex.conversions += r.cv_application;
    } else {
      googleByDate.set(r.date, {
        date: r.date,
        cost: r.cost,
        clicks: r.clicks,
        cpc: 0,
        conversions: r.cv_application,
      });
    }
  }
  const googleDaily: DailyKpi[] = Array.from(googleByDate.values())
    .map((d) => ({ ...d, cpc: d.clicks > 0 ? Math.round(d.cost / d.clicks) : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Meta: 日別に集計
  const metaByDate = new Map<string, DailyKpi>();
  for (const r of metaRaw) {
    const ex = metaByDate.get(r.date);
    if (ex) {
      ex.cost += r.spend;
      ex.clicks += r.clicks;
      ex.conversions += r.cv_custom;
    } else {
      metaByDate.set(r.date, {
        date: r.date,
        cost: r.spend,
        clicks: r.clicks,
        cpc: 0,
        conversions: r.cv_custom,
      });
    }
  }
  const metaDaily: DailyKpi[] = Array.from(metaByDate.values())
    .map((d) => ({ ...d, cpc: d.clicks > 0 ? Math.round(d.cost / d.clicks) : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <AdsKpiClient title="Google広告 KPI" data={googleDaily} />
      <AdsKpiClient title="Meta広告 KPI" data={metaDaily} />
    </div>
  );
}
