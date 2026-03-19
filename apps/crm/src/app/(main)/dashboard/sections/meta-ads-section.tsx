import {
  fetchMetaCampaignDaily,
  fetchMetaFunnelData,
  adsFunnelIsClosed,
  adsFunnelIsScheduled,
  isAgentFunnelCustomer,
} from "@/lib/data/analytics";
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

const ADS_START = "2025-04";

export async function MetaAdsSection() {
  const [campaigns, funnel] = await Promise.all([
    fetchMetaCampaignDaily(180),
    fetchMetaFunnelData(),
  ]);

  // --- 広告データの週次/月次集計 ---
  const weeklyAds = new Map<string, { spend: number }>();
  for (const r of campaigns) {
    const wk = weekKey(r.date);
    const ex = weeklyAds.get(wk);
    if (ex) { ex.spend += r.spend; }
    else { weeklyAds.set(wk, { spend: r.spend }); }
  }

  const monthlyAds = new Map<string, { spend: number }>();
  for (const r of campaigns) {
    const mk = monthKey(r.date);
    const ex = monthlyAds.get(mk);
    if (ex) { ex.spend += r.spend; }
    else { monthlyAds.set(mk, { spend: r.spend }); }
  }

  // --- ファネルデータ: 顧客の application_date ベースで週/月に振り分け ---
  type ClosedCustomer = { name: string; ltv: number };
  type FunnelAgg = { scheduled: number; closed: number; revenue: number; closedCustomers: ClosedCustomer[] };

  const weeklyFunnel = new Map<string, FunnelAgg>();
  const monthlyFunnel = new Map<string, FunnelAgg>();
  const zero = (): FunnelAgg => ({ scheduled: 0, closed: 0, revenue: 0, closedCustomers: [] });

  for (const c of funnel) {
    if (!c.application_date) continue;
    const wk = weekKey(c.application_date);
    const mk = monthKey(c.application_date);
    const isScheduled = adsFunnelIsScheduled(c.stage) ? 1 : 0;
    const isClosed = adsFunnelIsClosed(c.stage) ? 1 : 0;
    const agentFee = isAgentFunnelCustomer(c) ? c.expected_referral_fee : 0;
    const rev = isClosed ? (c.confirmed_amount + c.subsidy_amount + agentFee) : 0;

    const wf = weeklyFunnel.get(wk) || zero();
    wf.scheduled += isScheduled;
    wf.closed += isClosed;
    wf.revenue += rev;
    if (isClosed) wf.closedCustomers.push({ name: c.name, ltv: rev });
    weeklyFunnel.set(wk, wf);

    const mf = monthlyFunnel.get(mk) || zero();
    mf.scheduled += isScheduled;
    mf.closed += isClosed;
    mf.revenue += rev;
    if (isClosed) mf.closedCustomers.push({ name: c.name, ltv: rev });
    monthlyFunnel.set(mk, mf);
  }

  // --- ローリングLTV計算（2ヶ月遡り） ---
  function calcRollingLtv(periodEnd: string): number {
    const endDate = new Date(periodEnd + (periodEnd.length === 7 ? "-28" : ""));
    endDate.setDate(endDate.getDate() + 6);
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 2);
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);

    let scheduled = 0, revenue = 0;
    for (const c of funnel) {
      if (!c.application_date || c.application_date < startStr || c.application_date > endStr) continue;
      if (adsFunnelIsScheduled(c.stage)) scheduled++;
      if (adsFunnelIsClosed(c.stage)) {
        const af = isAgentFunnelCustomer(c) ? c.expected_referral_fee : 0;
        revenue += c.confirmed_amount + c.subsidy_amount + af;
      }
    }
    return scheduled > 0 ? Math.round(revenue / scheduled) : 0;
  }

  // --- ローリングCPA計算（2ヶ月遡り） ---
  function calcRollingCpa(periodEnd: string): number {
    const endDate = new Date(periodEnd + (periodEnd.length === 7 ? "-28" : ""));
    endDate.setDate(endDate.getDate() + 6);
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 2);
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);

    let totalCost = 0;
    for (const r of campaigns) {
      if (r.date >= startStr && r.date <= endStr) {
        totalCost += r.spend;
      }
    }
    let scheduled = 0;
    for (const c of funnel) {
      if (!c.application_date || c.application_date < startStr || c.application_date > endStr) continue;
      if (adsFunnelIsScheduled(c.stage)) scheduled++;
    }
    return scheduled > 0 ? Math.round(totalCost / scheduled) : 0;
  }

  // --- 週次行を組み立て ---
  const allWeekKeys = new Set([...weeklyAds.keys(), ...weeklyFunnel.keys()]);
  const weeklyRows: MetaAdsRow[] = Array.from(allWeekKeys).filter(wk => wk >= ADS_START).sort().reverse().map(wk => {
    const ads = weeklyAds.get(wk) || { spend: 0 };
    const fnl = weeklyFunnel.get(wk) || zero();
    return {
      period: wk,
      spend: Math.round(ads.spend),
      scheduled: fnl.scheduled,
      closed: fnl.closed,
      revenue: Math.round(fnl.revenue),
      cpa_scheduled: calcRollingCpa(wk),
      rolling_ltv: calcRollingLtv(wk),
      closedCustomers: fnl.closedCustomers,
    };
  });

  // --- 月次行を組み立て ---
  const allMonthKeys = new Set([...monthlyAds.keys(), ...monthlyFunnel.keys()]);
  const monthlyRows: MetaAdsRow[] = Array.from(allMonthKeys).filter(mk => mk >= ADS_START).sort().reverse().map(mk => {
    const ads = monthlyAds.get(mk) || { spend: 0 };
    const fnl = monthlyFunnel.get(mk) || zero();
    return {
      period: mk,
      spend: Math.round(ads.spend),
      scheduled: fnl.scheduled,
      closed: fnl.closed,
      revenue: Math.round(fnl.revenue),
      cpa_scheduled: calcRollingCpa(mk),
      rolling_ltv: calcRollingLtv(mk),
      closedCustomers: fnl.closedCustomers,
    };
  });

  // --- キャンペーン別日別データ（積み上げ棒グラフ用） ---
  const campaignDaily = campaigns.map(r => ({
    date: r.date,
    campaign_name: r.campaign_name,
    cost: r.spend,
  }));

  return (
    <MetaAdsSummaryClient
      weeklyRows={weeklyRows}
      monthlyRows={monthlyRows}
      campaignDaily={campaignDaily}
    />
  );
}
