"use client";

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type {
  PageDailyRow,
  TrafficDaily,
  SearchQueryRow,
  SearchDailyRow,
  HourlyRow,
  AdsCampaignDaily,
  AdsKeywordDaily,
  AdsFunnelCustomer,
  YouTubeVideo,
  YouTubeDaily,
  YouTubeChannelDaily,
  YouTubeFunnelCustomer,
} from "@/lib/data/analytics";
import { YouTubeTab } from "./youtube-tab";

/* ───────── Types ───────── */
type MainTab = "seo" | "lp" | "ads" | "youtube";
type SeoSub = "pages" | "ctr" | "cannibalization" | "decay" | "keywords" | "hourly";
type Period = "week" | "month";
type Metric = "pageviews" | "sessions" | "users";

const METRIC_LABELS: Record<Metric, string> = { pageviews: "PV", sessions: "セッション", users: "ユーザー" };
const SITE_BASE = "https://akagiconsulting.com";

/* Expected CTR by position (industry avg) */
const EXPECTED_CTR: Record<number, number> = {
  1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.07,
  6: 0.05, 7: 0.04, 8: 0.03, 9: 0.03, 10: 0.025,
};
function expectedCtr(pos: number): number {
  const rounded = Math.min(Math.max(Math.round(pos), 1), 10);
  return EXPECTED_CTR[rounded] || 0.02;
}

/* ───────── Shared Utils ───────── */
interface Props {
  pageDailyRows: PageDailyRow[];
  traffic: TrafficDaily[];
  searchQueries: SearchQueryRow[];
  searchDailyRows: SearchDailyRow[];
  hourlyRows: HourlyRow[];
  adsCampaigns: AdsCampaignDaily[];
  adsKeywords: AdsKeywordDaily[];
  adsFunnel: AdsFunnelCustomer[];
  youtubeVideos: YouTubeVideo[];
  youtubeDaily: YouTubeDaily[];
  youtubeChannelDaily: YouTubeChannelDaily[];
  youtubeFunnel: YouTubeFunnelCustomer[];
}

function classifyLabel(segment: string): string {
  if (segment === "blog") return "ブログ";
  if (segment === "lp_main" || segment === "lp3") return "LP";
  return "その他";
}
function classifyFromPath(p: string): string {
  if (p.startsWith("/blog/")) return "ブログ";
  if (p === "/" || p.startsWith("/lp") || p.startsWith("/corporate") || p.startsWith("/schedule")) return "LP";
  return "その他";
}

function segmentBadge(label: string) {
  const c: Record<string, string> = {
    "ブログ": "bg-emerald-500/20 text-emerald-300",
    LP: "bg-blue-500/20 text-blue-300",
    "その他": "bg-gray-500/20 text-gray-400",
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c[label] || c["その他"]}`}>{label}</span>;
}

function getWeekKey(d: string): string {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(dt);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}
function getMonthKey(d: string): string { return d.slice(0, 7); }
function periodLabel(key: string, period: Period): string {
  if (period === "week") return key.slice(5);
  const parts = key.split("-");
  return `${parts[0]}/${parts[1]}`;
}

function heatmapBg(value: number, max: number): string {
  if (max === 0 || value === 0) return "";
  const r = value / max;
  if (r > 0.8) return "bg-indigo-500/50";
  if (r > 0.6) return "bg-indigo-500/35";
  if (r > 0.4) return "bg-indigo-500/25";
  if (r > 0.2) return "bg-indigo-500/15";
  return "bg-indigo-500/5";
}

function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function trendArrow(current: number, previous: number) {
  if (previous === 0 && current === 0) return <span className="text-gray-600">—</span>;
  if (previous === 0) return <span className="text-green-400">↑new</span>;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return <span className="text-gray-500">→</span>;
  return pct > 0
    ? <span className="text-green-400">↑{pct.toFixed(0)}%</span>
    : <span className="text-red-400">↓{Math.abs(pct).toFixed(0)}%</span>;
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
      active ? "border-brand text-white bg-white/5" : "border-transparent text-gray-400 hover:text-white hover:bg-white/5"
    }`}>{label}</button>
  );
}

function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
      active ? "bg-brand/20 text-brand border border-brand/30" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
    }`}>{label}</button>
  );
}

/* ═══════════════════════════════════════════
   SEO SUMMARY
   ═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   PAGE KPI TABLE (heatmap + trend)
   ═══════════════════════════════════════════ */
interface AggregatedPage {
  page_path: string;
  page_title: string | null;
  segment_label: string;
  totals: Record<Metric, number>;
  periods: Record<string, Record<Metric, number>>;
}

function PagesTab({ pageDailyRows, searchQueries }: { pageDailyRows: PageDailyRow[]; searchQueries: SearchQueryRow[] }) {
  const [period, setPeriod] = useState<Period>("week");
  const [metric, setMetric] = useState<Metric>("users");
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  // LP除外: SEO分析にはブログ等のみ表示
  const seoRows = useMemo(() => {
    return pageDailyRows.filter(r => {
      const seg = r.segment || "";
      if (seg === "lp_main" || seg === "lp3") return false;
      // segment未設定の場合はpathで判定
      if (!seg && (r.page_path === "/" || r.page_path.startsWith("/lp"))) return false;
      return true;
    });
  }, [pageDailyRows]);

  const { pages, periodKeys } = useMemo(() => {
    const getPK = period === "week" ? getWeekKey : getMonthKey;
    const pageMap = new Map<string, AggregatedPage>();
    const allPKs = new Set<string>();
    const empty = (): Record<Metric, number> => ({ pageviews: 0, sessions: 0, users: 0 });

    for (const row of seoRows) {
      const pk = getPK(row.date);
      allPKs.add(pk);
      const ex = pageMap.get(row.page_path);
      if (ex) {
        ex.totals.pageviews += row.pageviews; ex.totals.sessions += row.sessions; ex.totals.users += row.users;
        if (!ex.periods[pk]) ex.periods[pk] = empty();
        ex.periods[pk].pageviews += row.pageviews; ex.periods[pk].sessions += row.sessions; ex.periods[pk].users += row.users;
      } else {
        const t = empty(); t.pageviews = row.pageviews; t.sessions = row.sessions; t.users = row.users;
        const pr = empty(); pr.pageviews = row.pageviews; pr.sessions = row.sessions; pr.users = row.users;
        pageMap.set(row.page_path, {
          page_path: row.page_path, page_title: row.page_title,
          segment_label: row.segment ? classifyLabel(row.segment) : classifyFromPath(row.page_path),
          totals: t, periods: { [pk]: pr },
        });
      }
    }
    return {
      pages: Array.from(pageMap.values()).sort((a, b) => b.totals[metric] - a.totals[metric]),
      periodKeys: Array.from(allPKs).sort(),
    };
  }, [seoRows, period, metric]);

  const maxVal = useMemo(() => {
    let mv = 0;
    for (const p of pages) for (const prd of Object.values(p.periods)) if (prd[metric] > mv) mv = prd[metric];
    return mv;
  }, [pages, metric]);

  const queriesForPage = useMemo(() => {
    if (!expandedPage) return [];
    return searchQueries.filter(q => q.page_path === expandedPage).sort((a, b) => b.clicks - a.clicks);
  }, [expandedPage, searchQueries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{pages.length} ページ / 過去90日（SEOのみ）</p>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {(["pageviews", "sessions", "users"] as const).map(m => (
              <button key={m} onClick={() => setMetric(m)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${metric === m ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {(["week", "month"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${period === p ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                {p === "week" ? "週別" : "月別"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10">
                <th className="text-left py-2.5 px-3 text-gray-400 w-20">種別</th>
                <th className="text-left py-2.5 px-3 text-gray-400 min-w-[250px]">ページ</th>
                <th className="text-right py-2.5 px-2 text-gray-400 w-20">合計</th>
                {periodKeys.map(pk => (
                  <th key={pk} className="text-center py-2.5 px-1 text-gray-500 w-16 whitespace-nowrap">{periodLabel(pk, period)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pages.slice(0, 100).map(p => {
                const isExp = expandedPage === p.page_path;
                return (
                  <>
                    <tr key={p.page_path} className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${isExp ? "bg-white/5" : ""}`}
                      onClick={() => setExpandedPage(isExp ? null : p.page_path)}>
                      <td className="py-2 px-3">{segmentBadge(p.segment_label)}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white truncate max-w-sm" title={p.page_title || ""}>{p.page_title || p.page_path}</p>
                            <p className="text-[10px] text-gray-600 truncate">{p.page_path}</p>
                          </div>
                          <a href={`${SITE_BASE}${p.page_path}`} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()} className="shrink-0 text-gray-500 hover:text-brand transition-colors" title="ページを開く">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 text-white font-medium">{p.totals[metric].toLocaleString()}</td>
                      {periodKeys.map(pk => {
                        const val = p.periods[pk]?.[metric] || 0;
                        return (
                          <td key={pk} className={`text-center py-2 px-1 ${heatmapBg(val, maxVal)}`}>
                            <span className={val > 0 ? "text-white/80" : "text-gray-700"}>{val > 0 ? val.toLocaleString() : ""}</span>
                          </td>
                        );
                      })}
                    </tr>
                    {isExp && (
                      <tr key={`${p.page_path}-q`}>
                        <td colSpan={3 + periodKeys.length} className="bg-white/[0.02] px-6 py-3">
                          {queriesForPage.length > 0 ? (
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">検索クエリ（直近30日）</p>
                              <table className="w-full text-xs">
                                <thead><tr className="text-gray-500 border-b border-white/5">
                                  <th className="text-left py-1.5 pr-3">クエリ</th>
                                  <th className="text-right py-1.5 px-2 w-16">クリック</th>
                                  <th className="text-right py-1.5 px-2 w-16">表示</th>
                                  <th className="text-right py-1.5 px-2 w-16">CTR</th>
                                  <th className="text-right py-1.5 pl-2 w-14">順位</th>
                                </tr></thead>
                                <tbody>{queriesForPage.map(q => (
                                  <tr key={q.query} className="border-b border-white/5">
                                    <td className="py-1.5 pr-3 text-white">{q.query}</td>
                                    <td className="text-right py-1.5 px-2 text-white font-medium">{q.clicks}</td>
                                    <td className="text-right py-1.5 px-2 text-gray-400">{q.impressions.toLocaleString()}</td>
                                    <td className="text-right py-1.5 px-2 text-gray-400">{(q.ctr * 100).toFixed(1)}%</td>
                                    <td className="text-right py-1.5 pl-2">
                                      <span className={q.position <= 3 ? "text-green-400" : q.position <= 10 ? "text-yellow-400" : "text-gray-500"}>{q.position.toFixed(1)}</span>
                                    </td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </div>
                          ) : <p className="text-xs text-gray-600">検索クエリデータなし</p>}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CTR IMPROVEMENT OPPORTUNITIES
   ═══════════════════════════════════════════ */
function CtrOpportunities({ searchQueries }: { searchQueries: SearchQueryRow[] }) {
  const opportunities = useMemo(() => {
    return searchQueries
      .filter(q => q.impressions >= 5 && q.position <= 30)
      .map(q => {
        const exp = expectedCtr(q.position);
        const gap = exp - q.ctr;
        const potentialClicks = Math.round(gap * q.impressions);
        return { ...q, expected: exp, gap, potentialClicks };
      })
      .filter(q => q.gap > 0.005 && q.potentialClicks >= 1)
      .sort((a, b) => b.potentialClicks - a.potentialClicks);
  }, [searchQueries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">CTRが順位の期待値より低いクエリ。タイトル・descriptionの改善でクリック数を増やせる可能性</p>
        <p className="text-xs text-gray-500">{opportunities.length} 件</p>
      </div>
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3">クエリ</th>
                <th className="text-left py-2.5 px-3 max-w-[200px]">ページ</th>
                <th className="text-right py-2.5 px-3">順位</th>
                <th className="text-right py-2.5 px-3">表示</th>
                <th className="text-right py-2.5 px-3">現CTR</th>
                <th className="text-right py-2.5 px-3">期待CTR</th>
                <th className="text-right py-2.5 px-3">GAP</th>
                <th className="text-right py-2.5 px-3">獲得可能Click</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.slice(0, 50).map((q, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2.5 px-3 text-white font-medium">{q.query}</td>
                  <td className="py-2.5 px-3 text-gray-400 truncate max-w-[200px]" title={q.page_path}>{q.page_path}</td>
                  <td className="text-right py-2.5 px-3">
                    <span className={q.position <= 3 ? "text-green-400" : q.position <= 10 ? "text-yellow-400" : "text-gray-300"}>{q.position.toFixed(1)}</span>
                  </td>
                  <td className="text-right py-2.5 px-3 text-gray-300">{q.impressions.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-red-400">{(q.ctr * 100).toFixed(1)}%</td>
                  <td className="text-right py-2.5 px-3 text-green-400">{(q.expected * 100).toFixed(1)}%</td>
                  <td className="text-right py-2.5 px-3 text-yellow-400">{(q.gap * 100).toFixed(1)}%</td>
                  <td className="text-right py-2.5 px-3"><span className="text-brand font-bold">+{q.potentialClicks}</span></td>
                </tr>
              ))}
              {opportunities.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-gray-500">改善チャンスなし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CANNIBALIZATION DETECTION
   ═══════════════════════════════════════════ */
function CannibalizationDetection({ searchQueries }: { searchQueries: SearchQueryRow[] }) {
  const cannibalized = useMemo(() => {
    const qMap = new Map<string, SearchQueryRow[]>();
    for (const q of searchQueries) {
      const ex = qMap.get(q.query);
      if (ex) ex.push(q); else qMap.set(q.query, [q]);
    }
    const results: { query: string; pages: SearchQueryRow[]; totalImpressions: number }[] = [];
    for (const [query, pages] of Array.from(qMap.entries())) {
      if (pages.length >= 2) {
        results.push({ query, pages: pages.sort((a, b) => a.position - b.position), totalImpressions: pages.reduce((s, p) => s + p.impressions, 0) });
      }
    }
    return results.sort((a, b) => b.totalImpressions - a.totalImpressions);
  }, [searchQueries]);

  const [expandedQ, setExpandedQ] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">同じキーワードで複数ページが競合 → コンテンツ統合の候補。{cannibalized.length}件検出</p>
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3">クエリ</th>
                <th className="text-right py-2.5 px-3">競合数</th>
                <th className="text-right py-2.5 px-3">合計表示</th>
                <th className="text-right py-2.5 px-3">合計Click</th>
                <th className="text-right py-2.5 px-3">順位範囲</th>
              </tr>
            </thead>
            <tbody>
              {cannibalized.slice(0, 50).map(c => {
                const isExp = expandedQ === c.query;
                const totalClicks = c.pages.reduce((s, p) => s + p.clicks, 0);
                const minP = Math.min(...c.pages.map(p => p.position));
                const maxP = Math.max(...c.pages.map(p => p.position));
                return (
                  <>
                    <tr key={c.query} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer ${isExp ? "bg-white/5" : ""}`}
                      onClick={() => setExpandedQ(isExp ? null : c.query)}>
                      <td className="py-2.5 px-3 text-white font-medium">{c.query}</td>
                      <td className="text-right py-2.5 px-3">
                        <span className={c.pages.length >= 3 ? "text-red-400 font-bold" : "text-yellow-400"}>{c.pages.length}</span>
                      </td>
                      <td className="text-right py-2.5 px-3 text-gray-300">{c.totalImpressions.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-3 text-gray-300">{totalClicks}</td>
                      <td className="text-right py-2.5 px-3 text-gray-400">{minP.toFixed(1)} - {maxP.toFixed(1)}</td>
                    </tr>
                    {isExp && (
                      <tr key={`${c.query}-d`}>
                        <td colSpan={5} className="bg-white/[0.02] px-6 py-3">
                          <table className="w-full text-xs">
                            <thead><tr className="text-gray-500 border-b border-white/5">
                              <th className="text-left py-1.5">ページ</th>
                              <th className="text-right py-1.5 px-2">順位</th>
                              <th className="text-right py-1.5 px-2">Click</th>
                              <th className="text-right py-1.5 px-2">表示</th>
                              <th className="text-right py-1.5 px-2">CTR</th>
                            </tr></thead>
                            <tbody>{c.pages.map(p => (
                              <tr key={p.page_path} className="border-b border-white/5">
                                <td className="py-1.5 text-white truncate max-w-xs">{p.page_path}</td>
                                <td className="text-right py-1.5 px-2"><span className={p.position <= 10 ? "text-green-400" : "text-gray-400"}>{p.position.toFixed(1)}</span></td>
                                <td className="text-right py-1.5 px-2 text-white">{p.clicks}</td>
                                <td className="text-right py-1.5 px-2 text-gray-400">{p.impressions.toLocaleString()}</td>
                                <td className="text-right py-1.5 px-2 text-gray-400">{(p.ctr * 100).toFixed(1)}%</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {cannibalized.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-gray-500">カニバリなし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CONTENT DECAY DETECTION
   ═══════════════════════════════════════════ */
function ContentDecay({ pageDailyRows }: { pageDailyRows: PageDailyRow[] }) {
  const { declining, growing } = useMemo(() => {
    // GA4データは2-3日遅れるため、7日前を基準に比較（直近すぎると不完全データで誤判定する）
    const base = daysAgo(7), d14 = daysAgo(21), d28 = daysAgo(35);
    const recent = new Map<string, { users: number; title: string | null; segment: string }>();
    const prev = new Map<string, { users: number }>();

    for (const r of pageDailyRows) {
      if (r.date > d14 && r.date <= base) {
        const ex = recent.get(r.page_path);
        if (ex) ex.users += r.users; else recent.set(r.page_path, { users: r.users, title: r.page_title, segment: r.segment });
      } else if (r.date > d28 && r.date <= d14) {
        const ex = prev.get(r.page_path);
        if (ex) ex.users += r.users; else prev.set(r.page_path, { users: r.users });
      }
    }

    const all = new Set([...Array.from(recent.keys()), ...Array.from(prev.keys())]);
    const results: { page_path: string; title: string | null; recentUU: number; prevUU: number; change: number }[] = [];
    for (const path of Array.from(all)) {
      const r = recent.get(path), p = prev.get(path);
      const rUU = r?.users || 0, pUU = p?.users || 0;
      if (pUU < 5) continue;
      results.push({ page_path: path, title: r?.title || null, recentUU: rUU, prevUU: pUU, change: pUU > 0 ? ((rUU - pUU) / pUU) * 100 : 0 });
    }

    return {
      declining: results.filter(d => d.change < -10).sort((a, b) => a.change - b.change),
      growing: results.filter(d => d.change > 10).sort((a, b) => b.change - a.change),
    };
  }, [pageDailyRows]);

  const renderTable = (items: typeof declining, color: string, label: string) => (
    <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <h4 className={`text-sm font-medium ${color}`}>{label} ({items.length}件)</h4>
      </div>
      <div className="overflow-y-auto max-h-[500px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-raised"><tr className="text-gray-500 border-b border-white/10">
            <th className="text-left py-2 px-3">ページ</th>
            <th className="text-right py-2 px-2 w-14">前期</th>
            <th className="text-right py-2 px-2 w-14">今期</th>
            <th className="text-right py-2 px-2 w-16">変化</th>
          </tr></thead>
          <tbody>
            {items.slice(0, 30).map(d => (
              <tr key={d.page_path} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 px-3">
                  <p className="text-white truncate max-w-[200px]" title={d.title || d.page_path}>{d.title || d.page_path}</p>
                  <p className="text-[10px] text-gray-600 truncate">{d.page_path}</p>
                </td>
                <td className="text-right py-2 px-2 text-gray-400">{d.prevUU}</td>
                <td className="text-right py-2 px-2 text-white">{d.recentUU}</td>
                <td className={`text-right py-2 px-2 font-medium ${d.change < 0 ? "text-red-400" : "text-green-400"}`}>
                  {d.change > 0 ? "+" : ""}{d.change.toFixed(0)}%
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-500">なし</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">8〜21日前 vs 22〜35日前のユーザー数を比較（データ遅延を考慮し直近7日を除外）</p>
      <div className="space-y-4">
        {renderTable(declining, "text-red-400", "衰退コンテンツ")}
        {renderTable(growing, "text-green-400", "成長コンテンツ")}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   KEYWORD POSITION TRACKING
   ═══════════════════════════════════════════ */
function KeywordTracking({ searchDailyRows }: { searchDailyRows: SearchDailyRow[] }) {
  const { keywords, weekKeys } = useMemo(() => {
    const qMap = new Map<string, {
      query: string; totalImp: number; totalClicks: number;
      pages: Set<string>;
      weeklyPos: Map<string, { posSum: number; impSum: number }>;
    }>();

    for (const r of searchDailyRows) {
      const wk = getWeekKey(r.date);
      const ex = qMap.get(r.query);
      if (ex) {
        ex.totalImp += r.impressions; ex.totalClicks += r.clicks;
        ex.pages.add(r.page_path);
        const wp = ex.weeklyPos.get(wk);
        if (wp) { wp.posSum += r.position * r.impressions; wp.impSum += r.impressions; }
        else ex.weeklyPos.set(wk, { posSum: r.position * r.impressions, impSum: r.impressions });
      } else {
        const wp = new Map<string, { posSum: number; impSum: number }>();
        wp.set(wk, { posSum: r.position * r.impressions, impSum: r.impressions });
        qMap.set(r.query, { query: r.query, totalImp: r.impressions, totalClicks: r.clicks, pages: new Set([r.page_path]), weeklyPos: wp });
      }
    }

    const allWeeks = new Set<string>();
    for (const q of Array.from(qMap.values())) for (const wk of Array.from(q.weeklyPos.keys())) allWeeks.add(wk);
    const wks = Array.from(allWeeks).sort();

    const sorted = Array.from(qMap.values())
      .filter(q => q.totalClicks > 0 || q.totalImp >= 50)
      .sort((a, b) => b.totalClicks - a.totalClicks)
      .slice(0, 50)
      .map(q => {
        const positions: (number | null)[] = wks.map(wk => {
          const wp = q.weeklyPos.get(wk);
          return wp && wp.impSum > 0 ? wp.posSum / wp.impSum : null;
        });
        const valid = positions.filter((p): p is number => p !== null);
        const currentPos = valid.length > 0 ? valid[valid.length - 1] : null;
        const prevPos = valid.length > 1 ? valid[valid.length - 2] : null;
        return {
          query: q.query, totalImp: q.totalImp, totalClicks: q.totalClicks,
          bestPage: Array.from(q.pages)[0], positions, currentPos, prevPos,
        };
      });

    return { keywords: sorted, weekKeys: wks };
  }, [searchDailyRows]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">表示回数上位キーワードの週別順位推移（90日）</p>
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3 min-w-[200px]">キーワード</th>
                <th className="text-right py-2.5 px-2 w-16">表示</th>
                <th className="text-right py-2.5 px-2 w-16">Click</th>
                <th className="text-center py-2.5 px-2 w-14">変動</th>
                {weekKeys.map(wk => (
                  <th key={wk} className="text-center py-2.5 px-1 w-14 whitespace-nowrap">{wk.slice(5)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keywords.map(k => {
                const trend = k.currentPos !== null && k.prevPos !== null ? k.prevPos - k.currentPos : 0;
                return (
                  <tr key={k.query} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 px-3">
                      <p className="text-white truncate max-w-[200px]">{k.query}</p>
                      <p className="text-[10px] text-gray-600 truncate">{k.bestPage}</p>
                    </td>
                    <td className="text-right py-2 px-2 text-gray-300">{k.totalImp.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-gray-300">{k.totalClicks}</td>
                    <td className="text-center py-2 px-2">
                      {trend > 0.5 ? <span className="text-green-400">↑{trend.toFixed(1)}</span>
                        : trend < -0.5 ? <span className="text-red-400">↓{Math.abs(trend).toFixed(1)}</span>
                        : <span className="text-gray-500">→</span>}
                    </td>
                    {k.positions.map((pos, i) => {
                      if (pos === null) return <td key={i} className="text-center py-2 px-1 text-gray-700">—</td>;
                      const clr = pos <= 3 ? "text-green-400 font-medium" : pos <= 10 ? "text-blue-400" : pos <= 20 ? "text-yellow-400" : "text-gray-500";
                      return <td key={i} className={`text-center py-2 px-1 ${clr}`}>{pos.toFixed(1)}</td>;
                    })}
                  </tr>
                );
              })}
              {keywords.length === 0 && <tr><td colSpan={4 + weekKeys.length} className="py-8 text-center text-gray-500">データ不足</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HOURLY HEATMAP (Day x Hour)
   ═══════════════════════════════════════════ */
const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

// 5時〜翌4時（29時表記）の24スロット
const HOUR_SLOTS = [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4];
const HOUR_LABELS = ["5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28"];

function HourlyHeatmap({ hourlyRows }: { hourlyRows: HourlyRow[] }) {
  const { cells, maxVal } = useMemo(() => {
    // cells[dow][slotIndex] — dow: 0=月〜6=日, slotIndex: 0〜23 (5時〜28時)
    const c: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let mv = 0;
    for (const r of hourlyRows) {
      const d = new Date(r.date + "T00:00:00");
      let dow = d.getDay() - 1; // 0=月
      if (dow < 0) dow = 6;

      // 0-4時は前日扱い（28時概念）
      if (r.hour < 5) {
        dow = dow === 0 ? 6 : dow - 1; // 前日の曜日に
      }

      const slotIdx = HOUR_SLOTS.indexOf(r.hour);
      if (slotIdx >= 0) {
        c[dow][slotIdx] += r.users;
        if (c[dow][slotIdx] > mv) mv = c[dow][slotIdx];
      }
    }
    return { cells: c, maxVal: mv };
  }, [hourlyRows]);

  if (hourlyRows.length === 0) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">時間帯データはまだ収集中です。バックフィル完了後に表示されます。</p>
      </div>
    );
  }

  function cellColor(val: number): string {
    if (maxVal === 0 || val === 0) return "bg-white/[0.02]";
    const r = val / maxVal;
    if (r > 0.8) return "bg-orange-500/60";
    if (r > 0.6) return "bg-orange-500/40";
    if (r > 0.4) return "bg-orange-500/25";
    if (r > 0.2) return "bg-orange-500/15";
    return "bg-orange-500/5";
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">曜日x時間帯のユーザー数（90日合計）。5時〜翌4時（24〜28時は深夜帯）</p>
      <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>
              <th className="w-10" />
              {HOUR_LABELS.map((label, i) => (
                <th key={i} className={`text-center py-1 px-0.5 w-10 ${
                  i >= 19 ? "text-gray-600" : "text-gray-500"
                }`}>{label}</th>
              ))}
            </tr></thead>
            <tbody>
              {DAY_LABELS.map((day, di) => (
                <tr key={di}>
                  <td className="text-gray-400 font-medium py-0.5 pr-2 text-right">{day}</td>
                  {cells[di].map((val, si) => (
                    <td key={si} className={`text-center py-2 px-0.5 ${cellColor(val)} rounded-sm`}
                      title={`${day}曜 ${HOUR_LABELS[si]}時: ${val}UU`}>
                      <span className={val > 0 ? "text-white/70 text-[10px]" : "text-transparent text-[10px]"}>
                        {val > 0 ? val : "."}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-500">
          <span>少ない</span>
          {["bg-orange-500/5", "bg-orange-500/15", "bg-orange-500/25", "bg-orange-500/40", "bg-orange-500/60"].map((c, i) => (
            <span key={i} className={`w-4 h-4 rounded ${c}`} />
          ))}
          <span>多い</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   LP TRAFFIC TREND TAB (heatmap style)
   ═══════════════════════════════════════════ */
type LpMetric = "sessions" | "users" | "new_users" | "schedule_visits";
const LP_METRIC_LABELS: Record<LpMetric, string> = { sessions: "セッション", users: "ユーザー", new_users: "新規", schedule_visits: "CV" };

interface AggregatedTrafficSource {
  label: string;
  source: string | null;
  medium: string | null;
  totals: Record<LpMetric, number>;
  periods: Record<string, Record<LpMetric, number>>;
}

function LpTrafficTrendTab({ traffic, landingPage }: { traffic: TrafficDaily[]; landingPage: string }) {
  const [period, setPeriod] = useState<Period>("week");
  const [metric, setMetric] = useState<LpMetric>("sessions");

  const lpRows = useMemo(() => traffic.filter(t => t.landing_page === landingPage), [traffic, landingPage]);

  const { sources, periodKeys } = useMemo(() => {
    const getPK = period === "week" ? getWeekKey : getMonthKey;
    const srcMap = new Map<string, AggregatedTrafficSource>();
    const allPKs = new Set<string>();
    const empty = (): Record<LpMetric, number> => ({ sessions: 0, users: 0, new_users: 0, schedule_visits: 0 });

    for (const row of lpRows) {
      const pk = getPK(row.date);
      allPKs.add(pk);
      const key = `${row.source || "(direct)"}/${row.medium || "(none)"}`;
      const ex = srcMap.get(key);
      if (ex) {
        ex.totals.sessions += row.sessions; ex.totals.users += row.users;
        ex.totals.new_users += row.new_users; ex.totals.schedule_visits += row.schedule_visits;
        if (!ex.periods[pk]) ex.periods[pk] = empty();
        ex.periods[pk].sessions += row.sessions; ex.periods[pk].users += row.users;
        ex.periods[pk].new_users += row.new_users; ex.periods[pk].schedule_visits += row.schedule_visits;
      } else {
        const t = empty();
        t.sessions = row.sessions; t.users = row.users; t.new_users = row.new_users; t.schedule_visits = row.schedule_visits;
        const pr = { ...t };
        srcMap.set(key, {
          label: key, source: row.source, medium: row.medium,
          totals: t, periods: { [pk]: pr },
        });
      }
    }
    return {
      sources: Array.from(srcMap.values()).sort((a, b) => b.totals[metric] - a.totals[metric]),
      periodKeys: Array.from(allPKs).sort(),
    };
  }, [lpRows, period, metric]);

  const maxVal = useMemo(() => {
    let mv = 0;
    for (const s of sources) for (const prd of Object.values(s.periods)) if (prd[metric] > mv) mv = prd[metric];
    return mv;
  }, [sources, metric]);

  // KPIサマリー（全体）
  const kpis = useMemo(() => {
    const totals = { sessions: 0, users: 0, new_users: 0, schedule_visits: 0 };
    for (const row of lpRows) {
      totals.sessions += row.sessions; totals.users += row.users;
      totals.new_users += row.new_users; totals.schedule_visits += row.schedule_visits;
    }
    return totals;
  }, [lpRows]);

  const lpLabel = landingPage === "/" ? "メインLP (/)" : "YouTube LP (/lp3/)";

  return (
    <div className="space-y-4">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="セッション" value={kpis.sessions.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">過去90日</span>} />
        <KpiCard title="ユーザー" value={kpis.users.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">過去90日</span>} />
        <KpiCard title="新規ユーザー" value={kpis.new_users.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">過去90日</span>} />
        <KpiCard title="CV（日程予約）" value={kpis.schedule_visits.toLocaleString()} sub={<span className="text-gray-500 text-[10px]">CVR: {kpis.sessions > 0 ? `${((kpis.schedule_visits / kpis.sessions) * 100).toFixed(1)}%` : "—"}</span>} />
      </div>

      {/* Heatmap Table */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{lpLabel} 流入経路別推移 / {sources.length} ソース</p>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {(["sessions", "users", "new_users", "schedule_visits"] as const).map(m => (
              <button key={m} onClick={() => setMetric(m)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${metric === m ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                {LP_METRIC_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {(["week", "month"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${period === p ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                {p === "week" ? "週別" : "月別"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10">
                <th className="text-left py-2.5 px-3 text-gray-400 min-w-[200px]">流入経路</th>
                <th className="text-right py-2.5 px-2 text-gray-400 w-20">合計</th>
                {periodKeys.map(pk => (
                  <th key={pk} className="text-center py-2.5 px-1 text-gray-500 w-16 whitespace-nowrap">{periodLabel(pk, period)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.slice(0, 50).map(s => (
                <tr key={s.label} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-2 px-3">
                    <p className="text-white">{s.source || "(direct)"}</p>
                    <p className="text-[10px] text-gray-600">{s.medium || "(none)"}</p>
                  </td>
                  <td className="text-right py-2 px-2 text-white font-medium">{s.totals[metric].toLocaleString()}</td>
                  {periodKeys.map(pk => {
                    const val = s.periods[pk]?.[metric] || 0;
                    return (
                      <td key={pk} className={`text-center py-2 px-1 ${heatmapBg(val, maxVal)}`}>
                        <span className={val > 0 ? "text-white/80" : "text-gray-700"}>{val > 0 ? val.toLocaleString() : ""}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {sources.length === 0 && <tr><td colSpan={2 + periodKeys.length} className="py-8 text-center text-gray-500">データがありません</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   GOOGLE ADS TAB
   ═══════════════════════════════════════════ */
type AdsGranularity = "daily" | "weekly" | "monthly";
type AdsSub = "overview" | "campaigns" | "keywords" | "funnel";

function AdsTab({ adsCampaigns, adsKeywords, adsFunnel }: { adsCampaigns: AdsCampaignDaily[]; adsKeywords: AdsKeywordDaily[]; adsFunnel: AdsFunnelCustomer[] }) {
  const [granularity, setGranularity] = useState<AdsGranularity>("daily");
  const [adsSub, setAdsSub] = useState<AdsSub>("overview");

  if (adsCampaigns.length === 0) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">Google Ads データはまだ収集中です。バックフィル完了後に表示されます。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <SubTab label="サマリー" active={adsSub === "overview"} onClick={() => setAdsSub("overview")} />
        <SubTab label="キャンペーン別" active={adsSub === "campaigns"} onClick={() => setAdsSub("campaigns")} />
        <SubTab label="キーワード別" active={adsSub === "keywords"} onClick={() => setAdsSub("keywords")} />
        <SubTab label="ファネル分析" active={adsSub === "funnel"} onClick={() => setAdsSub("funnel")} />
      </div>
      {adsSub === "overview" && <AdsOverview adsCampaigns={adsCampaigns} />}
      {adsSub === "campaigns" && <AdsCampaignTable adsCampaigns={adsCampaigns} granularity={granularity} setGranularity={setGranularity} />}
      {adsSub === "keywords" && <AdsKeywordTable adsKeywords={adsKeywords} granularity={granularity} setGranularity={setGranularity} />}
      {adsSub === "funnel" && <AdsFunnelTab adsFunnel={adsFunnel} />}
    </div>
  );
}

/* ─── Ads KPI Cards + Charts (Overview) ─── */
function AdsOverview({ adsCampaigns }: { adsCampaigns: AdsCampaignDaily[] }) {
  // KPI calculations: current month vs previous month
  const kpis = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    // Current month day count for comparison
    const dayOfMonth = now.getDate();

    let curCost = 0, curClicks = 0, curImpressions = 0, curCvApp = 0, curCvMicro = 0;
    let prevCost = 0, prevClicks = 0, prevImpressions = 0, prevCvApp = 0, prevCvMicro = 0;

    for (const r of adsCampaigns) {
      const m = r.date.slice(0, 7);
      if (m === thisMonth) {
        curCost += r.cost; curClicks += r.clicks; curImpressions += r.impressions;
        curCvApp += r.cv_application; curCvMicro += r.cv_micro;
      } else if (m === prevMonth) {
        const day = parseInt(r.date.slice(8, 10));
        if (day <= dayOfMonth) {
          prevCost += r.cost; prevClicks += r.clicks; prevImpressions += r.impressions;
          prevCvApp += r.cv_application; prevCvMicro += r.cv_micro;
        }
      }
    }

    const curCTR = curImpressions > 0 ? (curClicks / curImpressions) * 100 : 0;
    const prevCTR = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0;
    const curCPA = curCvApp > 0 ? curCost / curCvApp : 0;
    const prevCPA = prevCvApp > 0 ? prevCost / prevCvApp : 0;

    return {
      cost: { current: curCost, prev: prevCost },
      cvApp: { current: curCvApp, prev: prevCvApp },
      cvMicro: { current: curCvMicro, prev: prevCvMicro },
      cpa: { current: curCPA, prev: prevCPA },
      ctr: { current: curCTR, prev: prevCTR },
      clicks: { current: curClicks, prev: prevClicks },
      impressions: { current: curImpressions, prev: prevImpressions },
    };
  }, [adsCampaigns]);

  // Chart data: daily aggregate for last 90 days
  const chartData = useMemo(() => {
    const dailyMap = new Map<string, { date: string; cost: number; clicks: number; cv_application: number; cv_micro: number; impressions: number }>();
    for (const r of adsCampaigns) {
      const ex = dailyMap.get(r.date);
      if (ex) {
        ex.cost += r.cost; ex.clicks += r.clicks; ex.cv_application += r.cv_application; ex.cv_micro += r.cv_micro; ex.impressions += r.impressions;
      } else {
        dailyMap.set(r.date, { date: r.date, cost: r.cost, clicks: r.clicks, cv_application: r.cv_application, cv_micro: r.cv_micro, impressions: r.impressions });
      }
    }
    return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [adsCampaigns]);

  // Campaign breakdown for current month
  const campaignBreakdown = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const map = new Map<string, { name: string; cost: number; clicks: number; impressions: number; cv_application: number; cv_micro: number }>();
    for (const r of adsCampaigns) {
      if (r.date.slice(0, 7) !== thisMonth) continue;
      const ex = map.get(r.campaign_name);
      if (ex) {
        ex.cost += r.cost; ex.clicks += r.clicks; ex.impressions += r.impressions;
        ex.cv_application += r.cv_application; ex.cv_micro += r.cv_micro;
      } else {
        map.set(r.campaign_name, { name: r.campaign_name, cost: r.cost, clicks: r.clicks, impressions: r.impressions, cv_application: r.cv_application, cv_micro: r.cv_micro });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [adsCampaigns]);

  function kpiChange(current: number, prev: number, invert?: boolean) {
    if (prev === 0 && current === 0) return <span className="text-gray-600 text-[10px]">—</span>;
    if (prev === 0) return <span className="text-green-400 text-[10px]">NEW</span>;
    const pct = ((current - prev) / prev) * 100;
    const isGood = invert ? pct < 0 : pct > 0;
    return (
      <span className={`text-[10px] ${isGood ? "text-green-400" : "text-red-400"}`}>
        {pct > 0 ? "+" : ""}{pct.toFixed(0)}% vs 前月同期
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="広告費" value={`¥${Math.round(kpis.cost.current).toLocaleString()}`} sub={kpiChange(kpis.cost.current, kpis.cost.prev, true)} />
        <KpiCard title="申し込みCV" value={kpis.cvApp.current.toFixed(1)} sub={kpiChange(kpis.cvApp.current, kpis.cvApp.prev)} />
        <KpiCard title="申し込みCPA" value={kpis.cpa.current > 0 ? `¥${Math.round(kpis.cpa.current).toLocaleString()}` : "—"} sub={kpiChange(kpis.cpa.current, kpis.cpa.prev, true)} />
        <KpiCard title="CTR" value={`${kpis.ctr.current.toFixed(2)}%`} sub={kpiChange(kpis.ctr.current, kpis.ctr.prev)} />
        <KpiCard title="クリック" value={kpis.clicks.current.toLocaleString()} sub={kpiChange(kpis.clicks.current, kpis.clicks.prev)} />
        <KpiCard title="マイクロCV" value={kpis.cvMicro.current.toFixed(0)} sub={kpiChange(kpis.cvMicro.current, kpis.cvMicro.prev)} />
      </div>

      {/* Charts: Cost + CV trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">広告費推移（日別）</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={(v: string) => v.slice(5)} interval={6} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#9ca3af" }}
                formatter={(value) => [`¥${Math.round(Number(value)).toLocaleString()}`, "広告費"]}
              />
              <Line type="monotone" dataKey="cost" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">申し込みCV・クリック数推移（日別）</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }}
                tickFormatter={(v: string) => v.slice(5)} interval={6} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#9ca3af" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="right" type="monotone" dataKey="clicks" name="クリック" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="cv_application" name="申し込みCV" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campaign cost breakdown (current month) */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-300">今月のキャンペーン別コスト内訳</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-4">キャンペーン</th>
                <th className="text-right py-2.5 px-3">費用</th>
                <th className="text-right py-2.5 px-3">構成比</th>
                <th className="text-right py-2.5 px-3">クリック</th>
                <th className="text-right py-2.5 px-3">申し込みCV</th>
                <th className="text-right py-2.5 px-3">CPA</th>
              </tr>
            </thead>
            <tbody>
              {campaignBreakdown.map(c => {
                const totalCost = campaignBreakdown.reduce((s, x) => s + x.cost, 0);
                const share = totalCost > 0 ? (c.cost / totalCost) * 100 : 0;
                const cpa = c.cv_application > 0 ? c.cost / c.cv_application : 0;
                return (
                  <tr key={c.name} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4 text-white font-medium">{c.name}</td>
                    <td className="text-right py-2.5 px-3 text-white">¥{Math.round(c.cost).toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(share, 100)}%` }} />
                        </div>
                        <span className="text-gray-400 w-10 text-right">{share.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-300">{c.clicks.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3">
                      <span className={c.cv_application > 0 ? "text-green-400 font-medium" : "text-gray-600"}>{c.cv_application.toFixed(1)}</span>
                    </td>
                    <td className="text-right py-2.5 px-3 text-gray-300">{cpa > 0 ? `¥${Math.round(cpa).toLocaleString()}` : "—"}</td>
                  </tr>
                );
              })}
              {campaignBreakdown.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">今月のデータなし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, sub }: { title: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{title}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
      <div className="mt-1">{sub}</div>
    </div>
  );
}

/* ─── Campaign Table (with granularity) ─── */
function AdsCampaignTable({ adsCampaigns, granularity, setGranularity }: {
  adsCampaigns: AdsCampaignDaily[];
  granularity: AdsGranularity;
  setGranularity: (g: AdsGranularity) => void;
}) {
  const { rows, periodKeys } = useMemo(() => {
    const getPK = granularity === "daily" ? (d: string) => d
      : granularity === "weekly" ? getWeekKey : getMonthKey;

    // Group by campaign × period
    const campMap = new Map<string, {
      name: string;
      totals: { cost: number; clicks: number; impressions: number; cv_application: number };
      periods: Map<string, { cost: number; clicks: number; impressions: number; cv_application: number }>;
    }>();
    const allPKs = new Set<string>();
    const zero = () => ({ cost: 0, clicks: 0, impressions: 0, cv_application: 0 });

    for (const r of adsCampaigns) {
      const pk = getPK(r.date);
      allPKs.add(pk);
      const ex = campMap.get(r.campaign_name);
      if (ex) {
        ex.totals.cost += r.cost; ex.totals.clicks += r.clicks;
        ex.totals.impressions += r.impressions; ex.totals.cv_application += r.cv_application;
        const p = ex.periods.get(pk) || zero();
        p.cost += r.cost; p.clicks += r.clicks; p.impressions += r.impressions; p.cv_application += r.cv_application;
        ex.periods.set(pk, p);
      } else {
        const t = zero();
        t.cost = r.cost; t.clicks = r.clicks; t.impressions = r.impressions; t.cv_application = r.cv_application;
        const p = new Map([[pk, { ...t }]]);
        campMap.set(r.campaign_name, { name: r.campaign_name, totals: t, periods: p });
      }
    }

    return {
      rows: Array.from(campMap.values()).sort((a, b) => b.totals.cost - a.totals.cost),
      periodKeys: Array.from(allPKs).sort(),
    };
  }, [adsCampaigns, granularity]);

  const formatPK = (pk: string) => {
    if (granularity === "daily") return pk.slice(5); // MM-DD
    if (granularity === "weekly") return pk.slice(5); // MM-DD (week start)
    return pk; // YYYY-MM
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{rows.length} キャンペーン / 過去90日</p>
        <GranularitySelector granularity={granularity} setGranularity={setGranularity} />
      </div>
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3 min-w-[200px]">キャンペーン</th>
                <th className="text-right py-2.5 px-2 w-20">合計費用</th>
                <th className="text-right py-2.5 px-2 w-16">申込CV</th>
                <th className="text-right py-2.5 px-2 w-16">CPA</th>
                <th className="text-right py-2.5 px-2 w-16">CTR</th>
                {periodKeys.map(pk => (
                  <th key={pk} className="text-center py-2.5 px-1 w-20 whitespace-nowrap text-[10px]">{formatPK(pk)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const cpa = r.totals.cv_application > 0 ? r.totals.cost / r.totals.cv_application : 0;
                const ctr = r.totals.impressions > 0 ? (r.totals.clicks / r.totals.impressions) * 100 : 0;
                const maxCost = Math.max(...rows.map(x => x.totals.cost));
                return (
                  <tr key={r.name} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-3 text-white font-medium truncate max-w-[200px]">{r.name}</td>
                    <td className="text-right py-2.5 px-2 text-white">¥{Math.round(r.totals.cost).toLocaleString()}</td>
                    <td className="text-right py-2.5 px-2">
                      <span className={r.totals.cv_application > 0 ? "text-green-400" : "text-gray-600"}>{r.totals.cv_application.toFixed(1)}</span>
                    </td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{cpa > 0 ? `¥${Math.round(cpa).toLocaleString()}` : "—"}</td>
                    <td className="text-right py-2.5 px-2 text-gray-300">{ctr.toFixed(2)}%</td>
                    {periodKeys.map(pk => {
                      const p = r.periods.get(pk);
                      if (!p) return <td key={pk} className="text-center py-2.5 px-1 text-gray-700">—</td>;
                      const intensity = maxCost > 0 ? p.cost / maxCost : 0;
                      const bg = intensity > 0.6 ? "bg-amber-500/30" : intensity > 0.3 ? "bg-amber-500/15" : intensity > 0 ? "bg-amber-500/5" : "";
                      return (
                        <td key={pk} className={`text-center py-2.5 px-1 ${bg}`} title={`費用: ¥${Math.round(p.cost).toLocaleString()} / 申込CV: ${p.cv_application.toFixed(1)}`}>
                          <span className="text-white/80 text-[10px]">¥{p.cost >= 1000 ? `${(p.cost/1000).toFixed(0)}k` : Math.round(p.cost)}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={5 + periodKeys.length} className="py-8 text-center text-gray-500">データなし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Keyword Table (with granularity) ─── */
function AdsKeywordTable({ adsKeywords, granularity, setGranularity }: {
  adsKeywords: AdsKeywordDaily[];
  granularity: AdsGranularity;
  setGranularity: (g: AdsGranularity) => void;
}) {
  const [sortBy, setSortBy] = useState<"cost" | "clicks" | "cv_application" | "impressions">("cost");

  const keywords = useMemo(() => {
    const map = new Map<string, {
      keyword: string; campaign: string; matchType: string;
      cost: number; clicks: number; impressions: number; cv_application: number;
    }>();

    for (const r of adsKeywords) {
      const key = `${r.keyword}|${r.match_type}|${r.campaign_name}`;
      const ex = map.get(key);
      if (ex) {
        ex.cost += r.cost; ex.clicks += r.clicks; ex.impressions += r.impressions; ex.cv_application += r.cv_application;
      } else {
        map.set(key, {
          keyword: r.keyword, campaign: r.campaign_name, matchType: r.match_type,
          cost: r.cost, clicks: r.clicks, impressions: r.impressions, cv_application: r.cv_application,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b[sortBy] - a[sortBy]);
  }, [adsKeywords, sortBy]);

  // Period-level data for the table
  const { periodData, periodKeys } = useMemo(() => {
    const getPK = granularity === "daily" ? (d: string) => d
      : granularity === "weekly" ? getWeekKey : getMonthKey;

    const allPKs = new Set<string>();
    const data = new Map<string, Map<string, { cost: number; clicks: number; cv_application: number }>>();

    for (const r of adsKeywords) {
      const pk = getPK(r.date);
      allPKs.add(pk);
      const kwKey = `${r.keyword}|${r.match_type}|${r.campaign_name}`;
      if (!data.has(kwKey)) data.set(kwKey, new Map());
      const periods = data.get(kwKey)!;
      const ex = periods.get(pk) || { cost: 0, clicks: 0, cv_application: 0 };
      ex.cost += r.cost; ex.clicks += r.clicks; ex.cv_application += r.cv_application;
      periods.set(pk, ex);
    }

    return { periodData: data, periodKeys: Array.from(allPKs).sort() };
  }, [adsKeywords, granularity]);

  const formatPK = (pk: string) => {
    if (granularity === "daily") return pk.slice(5);
    if (granularity === "weekly") return pk.slice(5);
    return pk;
  };

  const matchBadge = (mt: string) => {
    const c: Record<string, string> = {
      EXACT: "bg-blue-500/20 text-blue-300",
      PHRASE: "bg-purple-500/20 text-purple-300",
      BROAD: "bg-gray-500/20 text-gray-400",
    };
    return <span className={`px-1.5 py-0.5 rounded text-[10px] ${c[mt] || c.BROAD}`}>{mt}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{keywords.length} キーワード / 過去90日</p>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {(["cost", "clicks", "cv_application", "impressions"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`px-2 py-1 text-[10px] rounded-md transition-colors ${sortBy === s ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
                {s === "cost" ? "費用順" : s === "clicks" ? "クリック順" : s === "cv_application" ? "CV順" : "表示順"}
              </button>
            ))}
          </div>
          <GranularitySelector granularity={granularity} setGranularity={setGranularity} />
        </div>
      </div>
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3">マッチ</th>
                <th className="text-left py-2.5 px-3 min-w-[180px]">キーワード</th>
                <th className="text-left py-2.5 px-3 max-w-[150px]">キャンペーン</th>
                <th className="text-right py-2.5 px-2 w-16">費用</th>
                <th className="text-right py-2.5 px-2 w-14">Click</th>
                <th className="text-right py-2.5 px-2 w-14">表示</th>
                <th className="text-right py-2.5 px-2 w-12">CTR</th>
                <th className="text-right py-2.5 px-2 w-10">申込CV</th>
                {periodKeys.slice(-12).map(pk => (
                  <th key={pk} className="text-center py-2.5 px-1 w-14 whitespace-nowrap text-[10px]">{formatPK(pk)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keywords.slice(0, 100).map((k) => {
                const ctr = k.impressions > 0 ? (k.clicks / k.impressions) * 100 : 0;
                const kwKey = `${k.keyword}|${k.matchType}|${k.campaign}`;
                const kwPeriods = periodData.get(kwKey);
                return (
                  <tr key={kwKey} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 px-3">{matchBadge(k.matchType)}</td>
                    <td className="py-2 px-3 text-white font-medium">{k.keyword}</td>
                    <td className="py-2 px-3 text-gray-400 truncate max-w-[150px]">{k.campaign}</td>
                    <td className="text-right py-2 px-2 text-white">¥{Math.round(k.cost).toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-gray-300">{k.clicks.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{k.impressions.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-gray-400">{ctr.toFixed(1)}%</td>
                    <td className="text-right py-2 px-2">
                      <span className={k.cv_application > 0 ? "text-green-400 font-medium" : "text-gray-600"}>{k.cv_application.toFixed(1)}</span>
                    </td>
                    {periodKeys.slice(-12).map(pk => {
                      const p = kwPeriods?.get(pk);
                      if (!p) return <td key={pk} className="text-center py-2 px-1 text-gray-700">—</td>;
                      return (
                        <td key={pk} className="text-center py-2 px-1" title={`費用: ¥${Math.round(p.cost).toLocaleString()}`}>
                          <span className={p.cv_application > 0 ? "text-green-400 text-[10px]" : "text-white/60 text-[10px]"}>
                            {p.clicks > 0 ? p.clicks : "—"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {keywords.length === 0 && <tr><td colSpan={8 + Math.min(periodKeys.length, 12)} className="py-8 text-center text-gray-500">データなし</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GranularitySelector({ granularity, setGranularity }: { granularity: AdsGranularity; setGranularity: (g: AdsGranularity) => void }) {
  return (
    <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
      {([["daily", "日別"], ["weekly", "週別"], ["monthly", "月別"]] as const).map(([v, label]) => (
        <button key={v} onClick={() => setGranularity(v)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${granularity === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>{label}</button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   GOOGLE ADS FUNNEL ANALYSIS (CRM自社データ)
   ═══════════════════════════════════════════ */

const FUNNEL_NOT_CONDUCTED = new Set(["日程未確", "未実施", "実施不可", "キャンセル", "NoShow"]);
function funnelIsClosed(stage: string | null): boolean {
  if (!stage) return false;
  return stage === "成約" || stage.startsWith("追加指導") || stage === "受講終了" || stage === "卒業";
}
function funnelIsConducted(stage: string | null): boolean {
  if (!stage) return false;
  return !FUNNEL_NOT_CONDUCTED.has(stage);
}
function funnelIsScheduled(stage: string | null): boolean {
  if (!stage) return false;
  return stage !== "日程未確";
}

function AdsFunnelTab({ adsFunnel }: { adsFunnel: AdsFunnelCustomer[] }) {
  const funnel = useMemo(() => {
    const total = adsFunnel.length;
    const scheduled = adsFunnel.filter(c => funnelIsScheduled(c.stage)).length;
    const conducted = adsFunnel.filter(c => funnelIsConducted(c.stage)).length;
    const closed = adsFunnel.filter(c => funnelIsClosed(c.stage)).length;
    const totalRevenue = adsFunnel.filter(c => funnelIsClosed(c.stage)).reduce((s, c) => s + c.confirmed_amount, 0);

    return { total, scheduled, conducted, closed, totalRevenue };
  }, [adsFunnel]);

  // Monthly breakdown
  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; applications: number; scheduled: number; conducted: number; closed: number; revenue: number }>();

    for (const c of adsFunnel) {
      const month = c.application_date?.slice(0, 7) || "不明";
      const ex = map.get(month) || { month, applications: 0, scheduled: 0, conducted: 0, closed: 0, revenue: 0 };
      ex.applications++;
      if (funnelIsScheduled(c.stage)) ex.scheduled++;
      if (funnelIsConducted(c.stage)) ex.conducted++;
      if (funnelIsClosed(c.stage)) { ex.closed++; ex.revenue += c.confirmed_amount; }
      map.set(month, ex);
    }

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)).filter(m => m.month !== "不明");
  }, [adsFunnel]);

  // Ad group / keyword breakdown (utm_medium contains adgroup+keyword info)
  const adGroupFunnel = useMemo(() => {
    const map = new Map<string, { label: string; applications: number; scheduled: number; conducted: number; closed: number; revenue: number }>();

    for (const c of adsFunnel) {
      // utm_medium has "{adgroupname}_keyword" format, or raw values like "303"
      const label = c.utm_medium || c.utm_campaign || "(不明)";
      const ex = map.get(label) || { label, applications: 0, scheduled: 0, conducted: 0, closed: 0, revenue: 0 };
      ex.applications++;
      if (funnelIsScheduled(c.stage)) ex.scheduled++;
      if (funnelIsConducted(c.stage)) ex.conducted++;
      if (funnelIsClosed(c.stage)) { ex.closed++; ex.revenue += c.confirmed_amount; }
      map.set(label, ex);
    }

    return Array.from(map.values()).sort((a, b) => b.applications - a.applications);
  }, [adsFunnel]);

  // Recent closed customers from ads
  const recentClosed = useMemo(() => {
    return adsFunnel
      .filter(c => funnelIsClosed(c.stage))
      .sort((a, b) => (b.application_date || "").localeCompare(a.application_date || ""))
      .slice(0, 20);
  }, [adsFunnel]);

  if (adsFunnel.length === 0) {
    return (
      <div className="bg-surface-raised border border-white/10 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">Google Ads経由の顧客データがありません（utm_source = &quot;googleads&quot;）</p>
      </div>
    );
  }

  const stages = [
    { label: "申し込み", count: funnel.total, color: "bg-blue-500" },
    { label: "日程確定", count: funnel.scheduled, color: "bg-cyan-500" },
    { label: "面談実施", count: funnel.conducted, color: "bg-amber-500" },
    { label: "成約", count: funnel.closed, color: "bg-green-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Funnel Summary KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard title="広告経由 申し込み" value={String(funnel.total)} sub={<span className="text-gray-500 text-[10px]">utm_source=googleads</span>} />
        <KpiCard title="日程確定" value={String(funnel.scheduled)} sub={<span className="text-[10px] text-gray-400">{funnel.total > 0 ? `${((funnel.scheduled / funnel.total) * 100).toFixed(0)}%` : "—"}</span>} />
        <KpiCard title="面談実施" value={String(funnel.conducted)} sub={<span className="text-[10px] text-gray-400">{funnel.scheduled > 0 ? `${((funnel.conducted / funnel.scheduled) * 100).toFixed(0)}% of 日程確定` : "—"}</span>} />
        <KpiCard title="成約" value={String(funnel.closed)} sub={<span className="text-[10px] text-gray-400">{funnel.conducted > 0 ? `${((funnel.closed / funnel.conducted) * 100).toFixed(0)}% of 面談実施` : "—"}</span>} />
        <KpiCard title="成約売上合計" value={`¥${Math.round(funnel.totalRevenue).toLocaleString()}`} sub={<span className="text-[10px] text-gray-400">{funnel.closed > 0 ? `CPA: ¥${Math.round(funnel.totalRevenue / funnel.closed).toLocaleString()}/件` : "—"}</span>} />
      </div>

      {/* Visual Funnel Bar */}
      <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-4">ファネル（全期間）</h3>
        <div className="space-y-3">
          {stages.map((s, i) => {
            const width = funnel.total > 0 ? (s.count / funnel.total) * 100 : 0;
            const prevCount = i > 0 ? stages[i - 1].count : s.count;
            const stepRate = prevCount > 0 ? ((s.count / prevCount) * 100).toFixed(0) : "—";
            return (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-16 text-right">{s.label}</span>
                <div className="flex-1 h-8 bg-white/5 rounded-lg overflow-hidden relative">
                  <div className={`h-full ${s.color} rounded-lg transition-all`} style={{ width: `${Math.max(width, 2)}%` }} />
                  <span className="absolute inset-0 flex items-center px-3 text-xs text-white font-medium">
                    {s.count}名 {i > 0 && <span className="ml-2 text-white/60">({stepRate}%)</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-right">
          <span className="text-xs text-gray-500">
            全体成約率: {funnel.total > 0 ? `${((funnel.closed / funnel.total) * 100).toFixed(1)}%` : "—"}
          </span>
        </div>
      </div>

      {/* Monthly Funnel Trend */}
      {monthlyData.length > 1 && (
        <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">月別ファネル推移</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#9ca3af" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="applications" name="申し込み" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="scheduled" name="日程確定" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="conducted" name="面談実施" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="closed" name="成約" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Ad Group / Keyword Funnel Breakdown */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium text-gray-300">広告グループ・キーワード別ファネル</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">utm_medium ベース</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-4">広告グループ / キーワード</th>
                <th className="text-right py-2.5 px-3">申し込み</th>
                <th className="text-right py-2.5 px-3">日程確定</th>
                <th className="text-right py-2.5 px-3">面談実施</th>
                <th className="text-right py-2.5 px-3">成約</th>
                <th className="text-right py-2.5 px-3">成約率</th>
                <th className="text-right py-2.5 px-3">成約売上</th>
              </tr>
            </thead>
            <tbody>
              {adGroupFunnel.map(c => {
                const rate = c.applications > 0 ? ((c.closed / c.applications) * 100).toFixed(1) : "—";
                return (
                  <tr key={c.label} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4 text-white font-medium truncate max-w-[300px]">{c.label}</td>
                    <td className="text-right py-2.5 px-3 text-blue-400">{c.applications}</td>
                    <td className="text-right py-2.5 px-3 text-cyan-400">{c.scheduled}</td>
                    <td className="text-right py-2.5 px-3 text-amber-400">{c.conducted}</td>
                    <td className="text-right py-2.5 px-3">
                      <span className={c.closed > 0 ? "text-green-400 font-medium" : "text-gray-600"}>{c.closed}</span>
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={c.closed > 0 ? "text-green-400" : "text-gray-600"}>{rate}{rate !== "—" ? "%" : ""}</span>
                    </td>
                    <td className="text-right py-2.5 px-3 text-white">{c.revenue > 0 ? `¥${Math.round(c.revenue).toLocaleString()}` : "—"}</td>
                  </tr>
                );
              })}
              {adGroupFunnel.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-gray-500">データなし</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Closed Customers from Ads */}
      {recentClosed.length > 0 && (
        <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10">
            <h3 className="text-sm font-medium text-gray-300">広告経由の成約顧客（直近）</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-gray-400">
                  <th className="text-left py-2.5 px-4">顧客名</th>
                  <th className="text-left py-2.5 px-3">申込日</th>
                  <th className="text-left py-2.5 px-3">属性</th>
                  <th className="text-left py-2.5 px-3">ステージ</th>
                  <th className="text-left py-2.5 px-3">キャンペーン</th>
                  <th className="text-left py-2.5 px-3">メディア</th>
                  <th className="text-right py-2.5 px-3">確定売上</th>
                </tr>
              </thead>
              <tbody>
                {recentClosed.map(c => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4 text-white font-medium">{c.name}</td>
                    <td className="py-2.5 px-3 text-gray-400">{c.application_date || "—"}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${c.attribute === "既卒" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}`}>
                        {c.attribute || "—"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-300">{c.stage}</span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-400 truncate max-w-[150px]">{c.utm_campaign || "—"}</td>
                    <td className="py-2.5 px-3 text-gray-400 truncate max-w-[150px]">{c.utm_medium || "—"}</td>
                    <td className="text-right py-2.5 px-3 text-white">{c.confirmed_amount > 0 ? `¥${Math.round(c.confirmed_amount).toLocaleString()}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════ */
const SEO_SUBS: { key: SeoSub; label: string }[] = [
  { key: "pages", label: "ページ別KPI" },
  { key: "ctr", label: "CTR改善" },
  { key: "cannibalization", label: "カニバリ検出" },
  { key: "decay", label: "衰退検出" },
  { key: "keywords", label: "キーワード追跡" },
  { key: "hourly", label: "時間帯分析" },
];

export function AnalyticsClient({ pageDailyRows, traffic, searchQueries, searchDailyRows, hourlyRows, adsCampaigns, adsKeywords, adsFunnel, youtubeVideos, youtubeDaily, youtubeChannelDaily, youtubeFunnel }: Props) {
  const [mainTab, setMainTab] = useState<MainTab>("seo");
  const [seoSub, setSeoSub] = useState<SeoSub>("pages");
  const [lpTab, setLpTab] = useState<"main" | "lp3">("main");

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">マーケティング分析</h1>
        <p className="text-sm text-gray-500 mt-1">GA4 + Search Console + Google Ads + YouTube</p>
      </div>

      <div className="flex gap-1 border-b border-white/10">
        <TabButton label="SEO分析" active={mainTab === "seo"} onClick={() => setMainTab("seo")} />
        <TabButton label="LP分析" active={mainTab === "lp"} onClick={() => setMainTab("lp")} />
        <TabButton label="広告分析" active={mainTab === "ads"} onClick={() => setMainTab("ads")} />
        <TabButton label="YouTube分析" active={mainTab === "youtube"} onClick={() => setMainTab("youtube")} />
      </div>

      {mainTab === "seo" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {SEO_SUBS.map(s => (
              <SubTab key={s.key} label={s.label} active={seoSub === s.key} onClick={() => setSeoSub(s.key)} />
            ))}
          </div>
          {seoSub === "pages" && <PagesTab pageDailyRows={pageDailyRows} searchQueries={searchQueries} />}
          {seoSub === "ctr" && <CtrOpportunities searchQueries={searchQueries} />}
          {seoSub === "cannibalization" && <CannibalizationDetection searchQueries={searchQueries} />}
          {seoSub === "decay" && <ContentDecay pageDailyRows={pageDailyRows} />}
          {seoSub === "keywords" && <KeywordTracking searchDailyRows={searchDailyRows} />}
          {seoSub === "hourly" && <HourlyHeatmap hourlyRows={hourlyRows} />}
        </div>
      )}

      {mainTab === "lp" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <SubTab label="メインLP" active={lpTab === "main"} onClick={() => setLpTab("main")} />
            <SubTab label="YouTube LP" active={lpTab === "lp3"} onClick={() => setLpTab("lp3")} />
          </div>
          {lpTab === "main" && <LpTrafficTrendTab traffic={traffic} landingPage="/" />}
          {lpTab === "lp3" && <LpTrafficTrendTab traffic={traffic} landingPage="/lp3/" />}
        </div>
      )}

      {mainTab === "ads" && (
        <AdsTab adsCampaigns={adsCampaigns} adsKeywords={adsKeywords} adsFunnel={adsFunnel} />
      )}

      {mainTab === "youtube" && (
        <YouTubeTab youtubeVideos={youtubeVideos} youtubeDaily={youtubeDaily} youtubeChannelDaily={youtubeChannelDaily} youtubeFunnel={youtubeFunnel} />
      )}
    </div>
  );
}
