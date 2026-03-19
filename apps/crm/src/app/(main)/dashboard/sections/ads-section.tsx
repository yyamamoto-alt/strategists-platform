import {
  fetchAdsCampaignDaily,
  fetchAdsFunnelData,
  adsFunnelIsClosed,
  adsFunnelIsScheduled,
  isAgentFunnelCustomer,
} from "@/lib/data/analytics";
import { AdsSummaryClient, type AdsWeeklyRow } from "./ads-client";

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

export async function AdsSection() {
  // 全期間分のデータを取得（クライアント側で期間フィルタ）
  const [campaigns, funnel] = await Promise.all([
    fetchAdsCampaignDaily(730), // 2年分取得（ADS_STARTでフィルタ）
    fetchAdsFunnelData(),
  ]);

  // --- 広告データの週次/月次集計用の生データ ---
  const weeklyAds = new Map<string, { cost: number }>();
  for (const r of campaigns) {
    const wk = weekKey(r.date);
    const ex = weeklyAds.get(wk);
    if (ex) {
      ex.cost += r.cost;
    } else {
      weeklyAds.set(wk, { cost: r.cost });
    }
  }

  const monthlyAds = new Map<string, { cost: number }>();
  for (const r of campaigns) {
    const mk = monthKey(r.date);
    const ex = monthlyAds.get(mk);
    if (ex) {
      ex.cost += r.cost;
    } else {
      monthlyAds.set(mk, { cost: r.cost });
    }
  }

  // --- ファネルデータ: 顧客の application_date ベースで週/月に振り分け ---
  // cv_application（申し込み数）もファネルデータからカウント
  type FunnelAgg = { cv_application: number; scheduled: number; closed: number; revenue: number };

  const weeklyFunnel = new Map<string, FunnelAgg>();
  const monthlyFunnel = new Map<string, FunnelAgg>();
  const zero = (): FunnelAgg => ({ cv_application: 0, scheduled: 0, closed: 0, revenue: 0 });

  for (const c of funnel) {
    if (!c.application_date) continue;
    const wk = weekKey(c.application_date);
    const mk = monthKey(c.application_date);
    const isScheduled = adsFunnelIsScheduled(c.stage) ? 1 : 0;
    const isClosed = adsFunnelIsClosed(c.stage) ? 1 : 0;
    const agentFee = isAgentFunnelCustomer(c) ? c.expected_referral_fee : 0;
    const rev = isClosed ? (c.confirmed_amount + c.subsidy_amount + agentFee) : 0;

    const wf = weeklyFunnel.get(wk) || zero();
    wf.cv_application += 1; // 顧客DBベースのカウント
    wf.scheduled += isScheduled;
    wf.closed += isClosed;
    wf.revenue += rev;
    weeklyFunnel.set(wk, wf);

    const mf = monthlyFunnel.get(mk) || zero();
    mf.cv_application += 1;
    mf.scheduled += isScheduled;
    mf.closed += isClosed;
    mf.revenue += rev;
    monthlyFunnel.set(mk, mf);
  }

  // --- ローリングLTV計算（各期間時点から2ヶ月遡り） ---
  function calcRollingLtv(periodEnd: string): number {
    const endDate = new Date(periodEnd + (periodEnd.length === 7 ? "-28" : ""));
    endDate.setDate(endDate.getDate() + 6); // 週末まで含む
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

  // --- ローリングCPA計算（各期間時点から2ヶ月遡り） ---
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
        totalCost += r.cost;
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
  const ADS_START = "2025-08";
  const allWeekKeys = new Set([...weeklyAds.keys(), ...weeklyFunnel.keys()]);
  const weeklyRows: AdsWeeklyRow[] = Array.from(allWeekKeys).filter(wk => wk >= ADS_START).sort().reverse().map(wk => {
    const ads = weeklyAds.get(wk) || { cost: 0 };
    const fnl = weeklyFunnel.get(wk) || zero();
    return {
      period: wk,
      cost: Math.round(ads.cost),
      cv_application: fnl.cv_application,
      scheduled: fnl.scheduled,
      closed: fnl.closed,
      revenue: Math.round(fnl.revenue),
      cpa_scheduled: calcRollingCpa(wk),
      rolling_ltv: calcRollingLtv(wk),
    };
  });

  // --- 月次行を組み立て ---
  const allMonthKeys = new Set([...monthlyAds.keys(), ...monthlyFunnel.keys()]);
  const monthlyRows: AdsWeeklyRow[] = Array.from(allMonthKeys).filter(mk => mk >= ADS_START).sort().reverse().map(mk => {
    const ads = monthlyAds.get(mk) || { cost: 0 };
    const fnl = monthlyFunnel.get(mk) || zero();
    return {
      period: mk,
      cost: Math.round(ads.cost),
      cv_application: fnl.cv_application,
      scheduled: fnl.scheduled,
      closed: fnl.closed,
      revenue: Math.round(fnl.revenue),
      cpa_scheduled: calcRollingCpa(mk),
      rolling_ltv: calcRollingLtv(mk),
    };
  });

  return (
    <AdsSummaryClient
      weeklyRows={weeklyRows}
      monthlyRows={monthlyRows}
    />
  );
}
