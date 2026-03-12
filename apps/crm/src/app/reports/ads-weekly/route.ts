import { computeWeeklyAdsMetrics, parseWeekParam, type WeeklyAdsMetrics } from "@/lib/data/ads-report";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}
function fmtYen(n: number): string {
  if (n >= 1_000_000) return `&yen;${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `&yen;${(n / 1_000).toFixed(0)}K`;
  return `&yen;${fmt(n)}`;
}
function pctChange(current: number, prev: number): string {
  if (prev === 0) return current === 0 ? "&plusmn;0%" : "+&infin;";
  const pct = Math.round(((current - prev) / prev) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}
function changeColor(current: number, prev: number, lowerIsBetter = false): string {
  if (prev === 0) return "#8888a0";
  const better = lowerIsBetter ? current < prev : current > prev;
  return better ? "#34d399" : current === prev ? "#8888a0" : "#f87171";
}

function renderReport(m: WeeklyAdsMetrics): string {
  const matchBadge = (t: string) => {
    const colors: Record<string, string> = { EXACT: "#34d399", PHRASE: "#818cf8", BROAD: "#f87171" };
    const c = colors[t] || "#8888a0";
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75em;font-weight:600;background:${c}20;color:${c}">${t}</span>`;
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Google Ads Weekly Report ${m.weekLabel}</title>
<style>
:root{--bg:#0a0a0f;--sf:#12121a;--sf2:#1a1a28;--bd:#2a2a3d;--tx:#e0e0e8;--tm:#8888a0;--ac:#6366f1;--ac2:#818cf8;--gn:#34d399;--rd:#f87171;--yw:#fbbf24;--cn:#22d3ee}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);color:var(--tx);line-height:1.6;-webkit-font-smoothing:antialiased}
.header{padding:40px 24px 30px;text-align:center;background:linear-gradient(135deg,#0f0c29,#1a1a3e);border-bottom:1px solid var(--bd)}
.header h1{font-size:1.6em;font-weight:700;margin-bottom:4px}
.header p{color:var(--tm);font-size:0.9em}
.container{max-width:800px;margin:0 auto;padding:24px 16px}
.card{background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:20px;margin-bottom:16px}
.card h2{font-size:1.1em;font-weight:700;margin-bottom:12px;color:var(--ac2)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
.stat{background:var(--sf2);border-radius:8px;padding:14px;text-align:center}
.stat-val{font-size:1.6em;font-weight:700}
.stat-lbl{font-size:0.78em;color:var(--tm);margin-top:2px}
.stat-chg{font-size:0.78em;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:0.85em;margin-top:8px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--bd)}
th{background:var(--sf2);color:var(--tm);font-weight:600;font-size:0.8em;text-transform:uppercase}
.footer{text-align:center;padding:24px;color:var(--tm);font-size:0.8em;border-top:1px solid var(--bd);margin-top:32px}
@media(max-width:600px){.grid{grid-template-columns:1fr 1fr}.stat-val{font-size:1.2em}}
</style>
</head>
<body>
<div class="header">
  <h1>Google Ads Weekly Report</h1>
  <p>${m.weekLabel} | ${m.weekStart} &ndash; ${m.weekEnd}</p>
</div>
<div class="container">

<div class="card">
  <h2>Search Campaign KPI</h2>
  <div class="grid">
    <div class="stat">
      <div class="stat-val" style="color:var(--ac2)">${fmtYen(m.searchCost)}</div>
      <div class="stat-lbl">Cost</div>
      <div class="stat-chg" style="color:${changeColor(m.searchCost, m.prevSearchCost, true)}">${pctChange(m.searchCost, m.prevSearchCost)} vs prev</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:${m.searchCpc <= (m.prevSearchCpc || Infinity) ? 'var(--gn)' : 'var(--rd)'}">${fmtYen(m.searchCpc)}</div>
      <div class="stat-lbl">CPC</div>
      <div class="stat-chg" style="color:${changeColor(m.searchCpc, m.prevSearchCpc, true)}">${pctChange(m.searchCpc, m.prevSearchCpc)} vs prev</div>
    </div>
    <div class="stat">
      <div class="stat-val">${fmt(m.searchClicks)}</div>
      <div class="stat-lbl">Clicks</div>
      <div class="stat-chg" style="color:${changeColor(m.searchClicks, m.prevSearchClicks)}">${pctChange(m.searchClicks, m.prevSearchClicks)} vs prev</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:${m.searchCvs > 0 ? 'var(--gn)' : 'var(--yw)'}">${m.searchCvs}</div>
      <div class="stat-lbl">AppCV</div>
      <div class="stat-chg" style="color:${changeColor(m.searchCvs, m.prevSearchCvs)}">prev: ${m.prevSearchCvs}</div>
    </div>
  </div>
  <table>
    <tr><td style="color:var(--tm)">CTR</td><td>${m.searchCtr}%</td><td style="color:var(--tm)">Impressions</td><td>${fmt(m.searchImpressions)}</td></tr>
    <tr><td style="color:var(--tm)">All Campaigns Cost</td><td>${fmtYen(m.totalCost)}</td><td style="color:var(--tm)">All Campaigns Clicks</td><td>${fmt(m.totalClicks)}</td></tr>
  </table>
</div>

<div class="card">
  <h2>Top Keywords (by clicks)</h2>
  <table>
    <tr><th>Keyword</th><th>Match</th><th>Clicks</th><th>CPC</th><th>CV</th></tr>
    ${m.topKeywords.map(k => `<tr><td>${k.keyword}</td><td>${matchBadge(k.matchType)}</td><td>${fmt(k.clicks)}</td><td>${fmtYen(k.cpc)}</td><td>${k.cvs}</td></tr>`).join("\n    ")}
    ${m.topKeywords.length === 0 ? '<tr><td colspan="5" style="color:var(--tm);text-align:center">No data</td></tr>' : ''}
  </table>
</div>

<div class="card">
  <h2>Cumulative Revenue (Google Ads)</h2>
  <div class="grid">
    <div class="stat">
      <div class="stat-val" style="color:var(--gn)">${fmtYen(m.confirmedRevenue)}</div>
      <div class="stat-lbl">Confirmed</div>
      <div class="stat-chg" style="color:var(--tm)">School + Agent + Subsidy</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:var(--cn)">${fmtYen(m.projectedRevenue)}</div>
      <div class="stat-lbl">Incl. Projected</div>
      <div class="stat-chg" style="color:var(--tm)">+ Agent projected</div>
    </div>
    <div class="stat">
      <div class="stat-val">${m.totalCustomers}</div>
      <div class="stat-lbl">Customers</div>
    </div>
    <div class="stat">
      <div class="stat-val">${m.totalSeiyaku}</div>
      <div class="stat-lbl">Seiyaku</div>
    </div>
  </div>
</div>

</div>
<div class="footer">
  Strategists CRM | Google Ads Weekly Report | Auto-generated
</div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const weekParam = searchParams.get("week") || undefined;
  const { year, week } = parseWeekParam(weekParam);

  try {
    const metrics = await computeWeeklyAdsMetrics(year, week);
    const html = renderReport(metrics);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    console.error("[ads-weekly] Error:", e);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
