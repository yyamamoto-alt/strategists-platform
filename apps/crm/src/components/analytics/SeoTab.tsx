"use client";

import { useState, useMemo } from "react";
import type {
  PageDailyRow,
  SearchQueryRow,
  SearchDailyRow,
  HourlyRow,
  Metric,
  Period,
  SeoSub,
} from "./shared";
import {
  METRIC_LABELS,
  SITE_BASE,
  expectedCtr,
  classifyLabel,
  classifyFromPath,
  segmentBadge,
  getWeekKey,
  getMonthKey,
  periodLabel,
  heatmapBg,
  daysAgo,
  SubTab,
} from "./shared";

/* ───────── SEO Sub definitions ───────── */
const SEO_SUBS: { key: SeoSub; label: string }[] = [
  { key: "pages", label: "ページ別KPI" },
  { key: "ctr", label: "CTR改善" },
  { key: "cannibalization", label: "カニバリ検出" },
  { key: "decay", label: "衰退検出" },
  { key: "keywords", label: "キーワード追跡" },
  { key: "hourly", label: "時間帯分析" },
];

/* ───────── SEO Tab Container ───────── */
interface SeoTabProps {
  pageDailyRows: PageDailyRow[];
  searchQueries: SearchQueryRow[];
  searchDailyRows: SearchDailyRow[];
  hourlyRows: HourlyRow[];
}

export function SeoTab({ pageDailyRows, searchQueries, searchDailyRows, hourlyRows }: SeoTabProps) {
  const [seoSub, setSeoSub] = useState<SeoSub>("pages");

  return (
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
  );
}

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
        <p className="text-xs text-gray-500">{pages.length} ページ / 選択期間（SEOのみ）</p>
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
