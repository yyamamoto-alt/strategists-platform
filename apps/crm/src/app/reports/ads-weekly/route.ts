import { computeWeeklyAdsMetrics, parseWeekParam, type WeeklyAdsMetrics } from "@/lib/data/ads-report";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return n.toLocaleString("ja-JP");
}
function fmtYen(n: number): string {
  return `&yen;${fmt(n)}`;
}
function fmtMan(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}億円`;
  if (n >= 10_000) return `${fmt(Math.round(n / 10_000))}万円`;
  return `${fmt(n)}円`;
}
function pctChange(current: number, prev: number): string {
  if (prev === 0) return current === 0 ? "&plusmn;0%" : "&mdash;";
  const pct = Math.round(((current - prev) / prev) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}
function changeColor(current: number, prev: number, lowerIsBetter = false): string {
  if (prev === 0) return "#8888a0";
  const better = lowerIsBetter ? current < prev : current > prev;
  return better ? "#34d399" : current === prev ? "#8888a0" : "#f87171";
}

function weatherInfo(m: WeeklyAdsMetrics): { icon: string; text: string; color: string } {
  const cpcBetter = m.prevSearchCpc > 0 && m.searchCpc <= m.prevSearchCpc;
  const clicksBetter = m.prevSearchClicks > 0 && m.searchClicks >= m.prevSearchClicks;
  const hasCv = m.searchCvs > 0;
  if (hasCv && cpcBetter && clicksBetter) return { icon: "&#9728;&#65039;", text: "好調", color: "#34d399" };
  if (hasCv && (cpcBetter || clicksBetter)) return { icon: "&#127780;", text: "概ね良好", color: "#34d399" };
  if (hasCv) return { icon: "&#9925;", text: "一部課題あり", color: "#fbbf24" };
  if (cpcBetter && clicksBetter) return { icon: "&#9925;", text: "効率改善中（CVなし）", color: "#fbbf24" };
  if (!hasCv && !clicksBetter) return { icon: "&#127783;", text: "要注意", color: "#f87171" };
  return { icon: "&#9729;", text: "CVゼロ・要注視", color: "#fbbf24" };
}

function renderReport(m: WeeklyAdsMetrics): string {
  const w = weatherInfo(m);
  const matchBadge = (t: string) => {
    const colors: Record<string, string> = { EXACT: "#34d399", PHRASE: "#818cf8", BROAD: "#f87171" };
    const c = colors[t] || "#8888a0";
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75em;font-weight:600;background:${c}20;color:${c}">${t}</span>`;
  };

  const searchTermRows = m.topSearchTerms.length > 0
    ? m.topSearchTerms.map(st =>
        `<tr><td>${st.searchTerm}</td><td>${st.keywordText || '<span style="color:var(--tm)">—</span>'}</td><td>${fmt(st.clicks)}</td><td>${fmt(Math.round(st.cost))}円</td><td>${st.cvs}</td></tr>`
      ).join("\n    ")
    : '<tr><td colspan="5" style="color:var(--tm);text-align:center">データなし（次回同期後に表示されます）</td></tr>';

  const settingsRows = m.campaignSettings.length > 0
    ? m.campaignSettings.map(s =>
        `<tr><td>${s.name}</td><td>${s.dailyBudget ? fmt(Math.round(s.dailyBudget)) + '円/日' : '—'}</td><td>${s.biddingType || '—'}</td><td>${s.targetCpa ? fmt(Math.round(s.targetCpa)) + '円' : '—'}</td></tr>`
      ).join("\n    ")
    : '<tr><td colspan="4" style="color:var(--tm);text-align:center">データなし（次回同期後に表示されます）</td></tr>';

  // 課題と提案
  const issues: string[] = [];
  const suggestions: string[] = [];
  if (m.searchCvs === 0) {
    issues.push(m.prevSearchCvs === 0 ? "2週連続で申込CVゼロ" : `今週の申込CVがゼロ（前週: ${m.prevSearchCvs}件）`);
    suggestions.push(m.prevSearchCvs === 0 ? "ターゲットCPA・キーワード構成の見直しを検討" : "統計変動の可能性あり。来週も0件なら要対策");
  }
  if (m.prevSearchCpc > 0 && m.searchCpc > m.prevSearchCpc * 1.2) {
    issues.push(`CPC上昇: ${fmt(m.prevSearchCpc)}円→${fmt(m.searchCpc)}円`);
    suggestions.push("品質スコア確認、除外キーワードの追加を検討");
  }
  if (m.prevSearchClicks > 0 && m.searchClicks < m.prevSearchClicks * 0.7) {
    issues.push(`クリック大幅減少: ${m.prevSearchClicks}→${m.searchClicks}件`);
    suggestions.push("インプレッション数を確認。表示機会が減っていないかチェック");
  }
  if (issues.length === 0) issues.push("大きな問題なし");
  if (suggestions.length === 0) suggestions.push("現状維持で経過観察");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Google Ads 週次レポート ${m.weekLabel}</title>
<style>
:root{--bg:#0a0a0f;--sf:#12121a;--sf2:#1a1a28;--bd:#2a2a3d;--tx:#e0e0e8;--tm:#8888a0;--ac:#6366f1;--ac2:#818cf8;--gn:#34d399;--rd:#f87171;--yw:#fbbf24;--cn:#22d3ee}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);color:var(--tx);line-height:1.6;-webkit-font-smoothing:antialiased}
.header{padding:40px 24px 30px;text-align:center;background:linear-gradient(135deg,#0f0c29,#1a1a3e);border-bottom:1px solid var(--bd)}
.header h1{font-size:1.6em;font-weight:700;margin-bottom:4px}
.header p{color:var(--tm);font-size:0.9em}
.weather{display:inline-block;padding:8px 20px;border-radius:8px;font-size:1.1em;font-weight:700;margin-top:12px}
.container{max-width:900px;margin:0 auto;padding:24px 16px}
.card{background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:20px;margin-bottom:16px}
.card h2{font-size:1.1em;font-weight:700;margin-bottom:12px;color:var(--ac2)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.stat{background:var(--sf2);border-radius:8px;padding:14px;text-align:center}
.stat-val{font-size:1.5em;font-weight:700}
.stat-lbl{font-size:0.78em;color:var(--tm);margin-top:2px}
.stat-chg{font-size:0.78em;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:0.85em;margin-top:8px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--bd)}
th{background:var(--sf2);color:var(--tm);font-weight:600;font-size:0.8em;text-transform:uppercase}
.callout{padding:14px 18px;border-radius:8px;margin:12px 0;border-left:4px solid}
.callout-warn{background:rgba(251,191,36,0.08);border-color:var(--yw)}
.callout-good{background:rgba(52,211,153,0.08);border-color:var(--gn)}
.callout-bad{background:rgba(248,113,113,0.08);border-color:var(--rd)}
.footer{text-align:center;padding:24px;color:var(--tm);font-size:0.8em;border-top:1px solid var(--bd);margin-top:32px}
@media(max-width:600px){.grid{grid-template-columns:1fr 1fr}.stat-val{font-size:1.2em}}
</style>
</head>
<body>
<div class="header">
  <h1>Google Ads 週次レポート</h1>
  <p>${m.weekLabel} | ${m.weekStart} &ndash; ${m.weekEnd}</p>
  <div class="weather" style="background:${w.color}20;color:${w.color}">${w.icon} ${w.text}</div>
</div>
<div class="container">

<!-- 総合判定 -->
<div class="card">
  <h2>総合判定・課題・提案</h2>
  <div class="callout ${m.searchCvs > 0 ? 'callout-good' : (m.prevSearchCvs === 0 && m.searchCvs === 0) ? 'callout-bad' : 'callout-warn'}">
    <strong>課題</strong>
    <ul style="margin:4px 0 0 16px">${issues.map(i => `<li>${i}</li>`).join("")}</ul>
  </div>
  <div class="callout callout-good">
    <strong>提案</strong>
    <ul style="margin:4px 0 0 16px">${suggestions.map(s => `<li>${s}</li>`).join("")}</ul>
  </div>
</div>

<!-- 検索キャンペーンKPI -->
<div class="card">
  <h2>検索キャンペーン KPI</h2>
  <div class="grid">
    <div class="stat">
      <div class="stat-val" style="color:var(--ac2)">${fmt(m.searchCost)}円</div>
      <div class="stat-lbl">費用</div>
      <div class="stat-chg" style="color:${changeColor(m.searchCost, m.prevSearchCost, true)}">${pctChange(m.searchCost, m.prevSearchCost)} (前週: ${fmt(m.prevSearchCost)}円)</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:${m.searchCpc <= (m.prevSearchCpc || Infinity) ? 'var(--gn)' : 'var(--rd)'}">${fmt(m.searchCpc)}円</div>
      <div class="stat-lbl">CPC（クリック単価）</div>
      <div class="stat-chg" style="color:${changeColor(m.searchCpc, m.prevSearchCpc, true)}">${pctChange(m.searchCpc, m.prevSearchCpc)} (前週: ${fmt(m.prevSearchCpc)}円)</div>
    </div>
    <div class="stat">
      <div class="stat-val">${fmt(m.searchClicks)}件</div>
      <div class="stat-lbl">クリック数</div>
      <div class="stat-chg" style="color:${changeColor(m.searchClicks, m.prevSearchClicks)}">${pctChange(m.searchClicks, m.prevSearchClicks)} (前週: ${fmt(m.prevSearchClicks)}件)</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:${m.searchCvs > 0 ? 'var(--gn)' : 'var(--yw)'}">${m.searchCvs}件</div>
      <div class="stat-lbl">申込CV</div>
      <div class="stat-chg" style="color:${changeColor(m.searchCvs, m.prevSearchCvs)}">前週: ${m.prevSearchCvs}件</div>
    </div>
  </div>
  <table>
    <tr><td style="color:var(--tm)">CTR（クリック率）</td><td>${m.searchCtr}%</td><td style="color:var(--tm)">表示回数</td><td>${fmt(m.searchImpressions)}回</td></tr>
    <tr><td style="color:var(--tm)">全キャンペーン費用</td><td>${fmt(m.totalCost)}円</td><td style="color:var(--tm)">全キャンペーンクリック</td><td>${fmt(m.totalClicks)}件</td></tr>
  </table>
</div>

<!-- キーワード別実績 -->
<div class="card">
  <h2>広告キーワード別実績（クリック順TOP5）</h2>
  <p style="font-size:0.82em;color:var(--tm);margin-bottom:8px">※ 広告キーワード = Google Ads管理画面で設定した入札対象キーワード</p>
  <table>
    <tr><th>キーワード</th><th>マッチタイプ</th><th>クリック</th><th>CPC</th><th>CV</th></tr>
    ${m.topKeywords.map(k => `<tr><td>${k.keyword}</td><td>${matchBadge(k.matchType)}</td><td>${fmt(k.clicks)}件</td><td>${fmt(k.cpc)}円</td><td>${k.cvs}</td></tr>`).join("\n    ")}
    ${m.topKeywords.length === 0 ? '<tr><td colspan="5" style="color:var(--tm);text-align:center">データなし</td></tr>' : ''}
  </table>
</div>

<!-- 検索語句レポート -->
<div class="card">
  <h2>検索語句レポート（実際のユーザー検索TOP10）</h2>
  <p style="font-size:0.82em;color:var(--tm);margin-bottom:8px">※ 検索語句 = ユーザーがGoogleで実際に検索した語句。Google Ads APIの search_term_view から取得。</p>
  <table>
    <tr><th>検索語句</th><th>マッチしたKW</th><th>クリック</th><th>費用</th><th>CV</th></tr>
    ${searchTermRows}
  </table>
</div>

<!-- キャンペーン設定 -->
<div class="card">
  <h2>キャンペーン設定（日予算・入札戦略）</h2>
  <p style="font-size:0.82em;color:var(--tm);margin-bottom:8px">※ Google Ads APIから直接取得した現在の設定値</p>
  <table>
    <tr><th>キャンペーン名</th><th>日予算</th><th>入札戦略</th><th>ターゲットCPA</th></tr>
    ${settingsRows}
  </table>
</div>

<!-- 売上サマリー -->
<div class="card">
  <h2>Google Ads経由 累計売上</h2>
  <div class="grid">
    <div class="stat">
      <div class="stat-val" style="color:var(--gn)">${fmtMan(m.confirmedRevenue)}</div>
      <div class="stat-lbl">確定売上</div>
      <div class="stat-chg" style="color:var(--tm)">スクール+エージェント確定+補助金</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:var(--cn)">${fmtMan(m.projectedRevenue)}</div>
      <div class="stat-lbl">見込み込み売上</div>
      <div class="stat-chg" style="color:var(--tm)">+エージェント見込</div>
    </div>
    <div class="stat">
      <div class="stat-val">${m.totalCustomers}名</div>
      <div class="stat-lbl">顧客数</div>
    </div>
    <div class="stat">
      <div class="stat-val">${m.totalSeiyaku}名</div>
      <div class="stat-lbl">成約数（入金済み）</div>
    </div>
  </div>
</div>

</div>
<div class="footer">
  Strategists CRM | Google Ads 週次レポート | 自動生成<br>
  データソース: Google Ads API (campaign, keyword_view, search_term_view, campaign_budget) / Supabase
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
