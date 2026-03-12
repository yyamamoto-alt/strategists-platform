import { NextResponse } from "next/server";
import { computeWeeklyAdsMetrics, parseWeekParam, currentWeekParam, type WeeklyAdsMetrics } from "@/lib/data/ads-report";
import { notifyAdsWeeklyReport } from "@/lib/slack";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

/* ── ヘルパー ── */

function fmtYen(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 10_000)}万${n % 10_000 >= 1_000 ? Math.round((n % 10_000) / 1_000) + "千" : ""}円`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}千円`;
  return `${n.toLocaleString("ja-JP")}円`;
}
function fmtYenShort(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}億円`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString("ja-JP")}万円`;
  return `${n.toLocaleString("ja-JP")}円`;
}
function pctChange(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? "±0%" : "—";
  const p = Math.round(((cur - prev) / prev) * 100);
  return p >= 0 ? `+${p}%` : `${p}%`;
}

/** 天気アイコン判定 */
function weatherIcon(m: WeeklyAdsMetrics): { icon: string; summary: string } {
  const cpcBetter = m.prevSearchCpc > 0 && m.searchCpc <= m.prevSearchCpc;
  const clicksBetter = m.prevSearchClicks > 0 && m.searchClicks >= m.prevSearchClicks;
  const hasCv = m.searchCvs > 0;

  if (hasCv && cpcBetter && clicksBetter) return { icon: "☀️", summary: "好調 — CV発生・CPC改善・クリック増" };
  if (hasCv && (cpcBetter || clicksBetter)) return { icon: "🌤", summary: "概ね良好 — CV発生" };
  if (hasCv) return { icon: "⛅", summary: "CV発生も一部指標に課題あり" };
  if (cpcBetter && clicksBetter) return { icon: "⛅", summary: "効率改善中だがCV未発生" };
  if (!hasCv && !clicksBetter) return { icon: "🌧", summary: "注意 — CVゼロ・クリック減少" };
  return { icon: "☁️", summary: "CVゼロ — 要注視" };
}

/** 課題と提案を自動生成 */
function generateInsights(m: WeeklyAdsMetrics): { issues: string[]; suggestions: string[] } {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // CV
  if (m.searchCvs === 0) {
    if (m.prevSearchCvs === 0) {
      issues.push("2週連続で申込CVゼロ");
      suggestions.push("ターゲットCPA・キーワード構成の見直しを検討");
    } else {
      issues.push("今週の申込CVがゼロ（前週: " + m.prevSearchCvs + "件）");
      suggestions.push("統計変動の可能性あり。来週も0なら対策を検討");
    }
  }

  // CPC
  if (m.prevSearchCpc > 0 && m.searchCpc > m.prevSearchCpc * 1.2) {
    issues.push(`CPC上昇 ${fmtYen(m.prevSearchCpc)}→${fmtYen(m.searchCpc)}`);
    suggestions.push("品質スコア確認、除外キーワードの追加を検討");
  }

  // Clicks
  if (m.prevSearchClicks > 0 && m.searchClicks < m.prevSearchClicks * 0.7) {
    issues.push(`クリック大幅減 ${m.prevSearchClicks}→${m.searchClicks}（${pctChange(m.searchClicks, m.prevSearchClicks)}）`);
    suggestions.push("インプレッション数を確認。表示機会が減っていないかチェック");
  }

  if (issues.length === 0) {
    issues.push("大きな問題なし");
  }
  if (suggestions.length === 0) {
    suggestions.push("現状維持で経過観察");
  }

  return { issues, suggestions };
}

/* ── メイン ── */

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const weekParam = currentWeekParam();
    const { year, week } = parseWeekParam(weekParam);
    const m = await computeWeeklyAdsMetrics(year, week);

    const reportUrl = `https://strategists-crm.vercel.app/reports/ads-weekly?week=${weekParam}`;
    const weather = weatherIcon(m);
    const { issues, suggestions } = generateInsights(m);

    // Slackメッセージ（固定フォーマット・短いサマリー）
    const text = [
      `${weather.icon} *Google Ads 週次レポート* (${m.weekLabel}: ${m.weekStart}〜${m.weekEnd})`,
      `*${weather.summary}*`,
      ``,
      `*■ 今週の数字*`,
      `  費用: ${fmtYen(m.searchCost)} (${pctChange(m.searchCost, m.prevSearchCost)})`,
      `  CPC: ${fmtYen(m.searchCpc)} (${pctChange(m.searchCpc, m.prevSearchCpc)})`,
      `  クリック: ${m.searchClicks}件 (${pctChange(m.searchClicks, m.prevSearchClicks)})`,
      `  申込CV: ${m.searchCvs}件 (前週: ${m.prevSearchCvs}件)`,
      ``,
      `*■ 課題*`,
      ...issues.map(i => `  ・${i}`),
      ``,
      `*■ 提案*`,
      ...suggestions.map(s => `  → ${s}`),
      ``,
      `📎 詳細レポート: ${reportUrl}`,
    ].join("\n");

    await notifyAdsWeeklyReport(text);

    return NextResponse.json({
      ok: true,
      week: weekParam,
      weather: weather.icon,
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
