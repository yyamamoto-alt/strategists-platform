import { NextResponse } from "next/server";
import { computeWeeklyAdsMetrics, parseWeekParam, currentWeekParam } from "@/lib/data/ads-report";
import { notifyAdsWeeklyReport } from "@/lib/slack";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  // 認証
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const weekParam = currentWeekParam();
    const { year, week } = parseWeekParam(weekParam);
    const m = await computeWeeklyAdsMetrics(year, week);

    // Slack送信用フォーマット（固定テンプレート）
    const fmtYen = (n: number) => {
      if (n >= 1_000_000) return `¥${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `¥${Math.round(n / 1_000)}K`;
      return `¥${n.toLocaleString()}`;
    };
    const pct = (cur: number, prev: number) => {
      if (prev === 0) return cur === 0 ? "±0%" : "—";
      const p = Math.round(((cur - prev) / prev) * 100);
      return p >= 0 ? `+${p}%` : `${p}%`;
    };

    const reportUrl = `https://strategists-crm.vercel.app/reports/ads-weekly?week=${weekParam}`;

    const text = [
      `📊 *Google Ads 週次レポート* (${m.weekLabel}: ${m.weekStart}〜${m.weekEnd})`,
      ``,
      `*■ 検索キャンペーン*`,
      `  費用: ${fmtYen(m.searchCost)} (${pct(m.searchCost, m.prevSearchCost)})`,
      `  CPC: ${fmtYen(m.searchCpc)} (${pct(m.searchCpc, m.prevSearchCpc)})`,
      `  クリック: ${m.searchClicks.toLocaleString()} (${pct(m.searchClicks, m.prevSearchClicks)})`,
      `  申込CV: ${m.searchCvs}件 (前週: ${m.prevSearchCvs}件)`,
      ``,
      `*■ 全キャンペーン*`,
      `  費用: ${fmtYen(m.totalCost)} / クリック: ${m.totalClicks.toLocaleString()}`,
      ``,
      `*■ TOP Keywords*`,
      ...m.topKeywords.slice(0, 3).map(k =>
        `  ${k.keyword} [${k.matchType}] — ${k.clicks}clicks, CPC ${fmtYen(k.cpc)}`
      ),
      ``,
      `*■ 累計売上 (Google Ads経由)*`,
      `  確定: ${fmtYen(m.confirmedRevenue)} / 見込込: ${fmtYen(m.projectedRevenue)}`,
      `  顧客: ${m.totalCustomers}名 / 成約: ${m.totalSeiyaku}名`,
      ``,
      `👉 詳細レポート: ${reportUrl}`,
    ].join("\n");

    await notifyAdsWeeklyReport(text);

    return NextResponse.json({
      ok: true,
      week: weekParam,
      metrics: {
        searchCost: m.searchCost,
        searchCpc: m.searchCpc,
        searchClicks: m.searchClicks,
        searchCvs: m.searchCvs,
      },
    });
  } catch (e) {
    console.error("[ads-weekly-report cron] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
