import {
  fetchAdsCampaignDaily,
  fetchAdsFunnelData,
  adsFunnelIsClosed,
  adsFunnelIsScheduled,
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
  const [campaigns, funnel] = await Promise.all([
    fetchAdsCampaignDaily(180),
    fetchAdsFunnelData(),
  ]);

  // --- 広告データの週次/月次集計用の生データ ---
  // 日別の広告費/申し込みCV を週キーでまとめる
  const weeklyAds = new Map<string, { cost: number; cv_application: number }>();
  for (const r of campaigns) {
    const wk = weekKey(r.date);
    const ex = weeklyAds.get(wk);
    if (ex) {
      ex.cost += r.cost;
      ex.cv_application += r.cv_application;
    } else {
      weeklyAds.set(wk, { cost: r.cost, cv_application: r.cv_application });
    }
  }

  const monthlyAds = new Map<string, { cost: number; cv_application: number }>();
  for (const r of campaigns) {
    const mk = monthKey(r.date);
    const ex = monthlyAds.get(mk);
    if (ex) {
      ex.cost += r.cost;
      ex.cv_application += r.cv_application;
    } else {
      monthlyAds.set(mk, { cost: r.cost, cv_application: r.cv_application });
    }
  }

  // --- ファネルデータ: 顧客の application_date ベースで週/月に振り分け ---
  type FunnelAgg = { scheduled: number; closed: number; revenue: number };

  const weeklyFunnel = new Map<string, FunnelAgg>();
  const monthlyFunnel = new Map<string, FunnelAgg>();
  const zero = (): FunnelAgg => ({ scheduled: 0, closed: 0, revenue: 0 });

  for (const c of funnel) {
    if (!c.application_date) continue;
    const wk = weekKey(c.application_date);
    const mk = monthKey(c.application_date);
    const isScheduled = adsFunnelIsScheduled(c.stage) ? 1 : 0;
    const isClosed = adsFunnelIsClosed(c.stage) ? 1 : 0;
    const rev = isClosed ? (c.confirmed_amount + c.expected_referral_fee) : 0;

    const wf = weeklyFunnel.get(wk) || zero();
    wf.scheduled += isScheduled;
    wf.closed += isClosed;
    wf.revenue += rev;
    weeklyFunnel.set(wk, wf);

    const mf = monthlyFunnel.get(mk) || zero();
    mf.scheduled += isScheduled;
    mf.closed += isClosed;
    mf.revenue += rev;
    monthlyFunnel.set(mk, mf);
  }

  // --- 直近3ヶ月のローリングLTV計算 ---
  // 3ヶ月前の日付
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10);

  let rollingScheduled = 0;
  let rollingRevenue = 0;
  for (const c of funnel) {
    if (!c.application_date || c.application_date < threeMonthsAgoStr) continue;
    if (adsFunnelIsScheduled(c.stage)) rollingScheduled++;
    if (adsFunnelIsClosed(c.stage)) {
      rollingRevenue += c.confirmed_amount + c.expected_referral_fee;
    }
  }
  const ltvPerScheduled = rollingScheduled > 0 ? Math.round(rollingRevenue / rollingScheduled) : 0;

  // --- 週次行を組み立て ---
  const allWeekKeys = new Set([...weeklyAds.keys(), ...weeklyFunnel.keys()]);
  const weeklyRows: AdsWeeklyRow[] = Array.from(allWeekKeys).sort().reverse().map(wk => {
    const ads = weeklyAds.get(wk) || { cost: 0, cv_application: 0 };
    const fnl = weeklyFunnel.get(wk) || zero();
    const cpaScheduled = fnl.scheduled > 0 ? ads.cost / fnl.scheduled : 0;
    return {
      period: wk,
      cost: Math.round(ads.cost),
      cv_application: ads.cv_application,
      scheduled: fnl.scheduled,
      closed: fnl.closed,
      revenue: Math.round(fnl.revenue),
      cpa_scheduled: Math.round(cpaScheduled),
    };
  });

  // --- 月次行を組み立て ---
  const allMonthKeys = new Set([...monthlyAds.keys(), ...monthlyFunnel.keys()]);
  const monthlyRows: AdsWeeklyRow[] = Array.from(allMonthKeys).sort().reverse().map(mk => {
    const ads = monthlyAds.get(mk) || { cost: 0, cv_application: 0 };
    const fnl = monthlyFunnel.get(mk) || zero();
    const cpaScheduled = fnl.scheduled > 0 ? ads.cost / fnl.scheduled : 0;
    return {
      period: mk,
      cost: Math.round(ads.cost),
      cv_application: ads.cv_application,
      scheduled: fnl.scheduled,
      closed: fnl.closed,
      revenue: Math.round(fnl.revenue),
      cpa_scheduled: Math.round(cpaScheduled),
    };
  });

  return (
    <AdsSummaryClient
      weeklyRows={weeklyRows}
      monthlyRows={monthlyRows}
      ltvPerScheduled={ltvPerScheduled}
      rollingScheduled={rollingScheduled}
      rollingRevenue={Math.round(rollingRevenue)}
    />
  );
}
