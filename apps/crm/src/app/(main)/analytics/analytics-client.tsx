"use client";

import { useState, useMemo } from "react";
import type {
  PageDailyRow,
  TrafficDaily,
  SearchQueryRow,
} from "@/lib/data/analytics";

type Tab = "pages" | "traffic_main" | "traffic_lp3";
type Period = "week" | "month";
type Metric = "pageviews" | "sessions" | "users";
const METRIC_LABELS: Record<Metric, string> = {
  pageviews: "PV",
  sessions: "セッション",
  users: "ユーザー",
};

interface Props {
  pageDailyRows: PageDailyRow[];
  traffic: TrafficDaily[];
  searchQueries: SearchQueryRow[];
}

const SITE_BASE = "https://akagiconsulting.com";

function classifyLabel(segment: string): string {
  if (segment === "blog") return "ブログ";
  if (segment === "lp_main" || segment === "lp3") return "LP";
  return "その他";
}

function classifyFromPath(pagePath: string): string {
  if (pagePath.startsWith("/blog/")) return "ブログ";
  if (
    pagePath === "/" ||
    pagePath.startsWith("/lp") ||
    pagePath.startsWith("/corporate") ||
    pagePath.startsWith("/schedule")
  )
    return "LP";
  return "その他";
}

function segmentBadge(label: string) {
  const colors: Record<string, string> = {
    ブログ: "bg-emerald-500/20 text-emerald-300",
    LP: "bg-blue-500/20 text-blue-300",
    その他: "bg-gray-500/20 text-gray-400",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[label] || colors["その他"]}`}>
      {label}
    </span>
  );
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function periodLabel(key: string, period: Period): string {
  if (period === "week") return key.slice(5);
  const [y, m] = key.split("-");
  return `${y}/${m}`;
}

function heatmapBg(value: number, max: number): string {
  if (max === 0 || value === 0) return "";
  const ratio = value / max;
  if (ratio > 0.8) return "bg-indigo-500/50";
  if (ratio > 0.6) return "bg-indigo-500/35";
  if (ratio > 0.4) return "bg-indigo-500/25";
  if (ratio > 0.2) return "bg-indigo-500/15";
  return "bg-indigo-500/5";
}

interface AggregatedPage {
  page_path: string;
  page_title: string | null;
  segment_label: string;
  totals: Record<Metric, number>;
  periods: Record<string, Record<Metric, number>>;
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
        active
          ? "border-brand text-white bg-white/5"
          : "border-transparent text-gray-400 hover:text-white hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

function PagesTab({
  pageDailyRows,
  searchQueries,
}: {
  pageDailyRows: PageDailyRow[];
  searchQueries: SearchQueryRow[];
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [metric, setMetric] = useState<Metric>("users");
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  const { pages, periodKeys } = useMemo(() => {
    const getPeriodKey = period === "week" ? getWeekKey : getMonthKey;

    const pageMap = new Map<string, AggregatedPage>();
    const allPeriodKeys = new Set<string>();
    const emptyTotals = (): Record<Metric, number> => ({ pageviews: 0, sessions: 0, users: 0 });

    for (const row of pageDailyRows) {
      const pk = getPeriodKey(row.date);
      allPeriodKeys.add(pk);

      const existing = pageMap.get(row.page_path);
      if (existing) {
        existing.totals.pageviews += row.pageviews;
        existing.totals.sessions += row.sessions;
        existing.totals.users += row.users;
        if (!existing.periods[pk]) existing.periods[pk] = emptyTotals();
        existing.periods[pk].pageviews += row.pageviews;
        existing.periods[pk].sessions += row.sessions;
        existing.periods[pk].users += row.users;
      } else {
        const t = emptyTotals();
        t.pageviews = row.pageviews;
        t.sessions = row.sessions;
        t.users = row.users;
        const prd = emptyTotals();
        prd.pageviews = row.pageviews;
        prd.sessions = row.sessions;
        prd.users = row.users;
        pageMap.set(row.page_path, {
          page_path: row.page_path,
          page_title: row.page_title,
          segment_label: row.segment ? classifyLabel(row.segment) : classifyFromPath(row.page_path),
          totals: t,
          periods: { [pk]: prd },
        });
      }
    }

    const sortedKeys = Array.from(allPeriodKeys).sort();
    const sortedPages = Array.from(pageMap.values()).sort((a, b) => b.totals[metric] - a.totals[metric]);

    return { pages: sortedPages, periodKeys: sortedKeys };
  }, [pageDailyRows, period, metric]);

  const maxVal = useMemo(() => {
    let mv = 0;
    for (const p of pages) {
      for (const prd of Object.values(p.periods)) {
        if (prd[metric] > mv) mv = prd[metric];
      }
    }
    return mv;
  }, [pages, metric]);

  const queriesForPage = useMemo(() => {
    if (!expandedPage) return [];
    return searchQueries
      .filter((q) => q.page_path === expandedPage)
      .sort((a, b) => b.clicks - a.clicks);
  }, [expandedPage, searchQueries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{pages.length} ページ / 過去90日</p>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {(["pageviews", "sessions", "users"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  metric === m ? "bg-brand text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {(["week", "month"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  period === p ? "bg-brand text-white" : "text-gray-400 hover:text-white"
                }`}
              >
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
                {periodKeys.map((pk) => (
                  <th key={pk} className="text-center py-2.5 px-1 text-gray-500 w-16 whitespace-nowrap">
                    {periodLabel(pk, period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pages.slice(0, 100).map((p) => {
                const isExpanded = expandedPage === p.page_path;
                return (
                  <>
                    <tr
                      key={p.page_path}
                      className={`border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${
                        isExpanded ? "bg-white/5" : ""
                      }`}
                      onClick={() => setExpandedPage(isExpanded ? null : p.page_path)}
                    >
                      <td className="py-2 px-3">{segmentBadge(p.segment_label)}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white truncate max-w-sm" title={p.page_title || ""}>
                              {p.page_title || p.page_path}
                            </p>
                            <p className="text-[10px] text-gray-600 truncate">{p.page_path}</p>
                          </div>
                          <a
                            href={`${SITE_BASE}${p.page_path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 text-gray-500 hover:text-brand transition-colors"
                            title="ページを開く"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 text-white font-medium">
                        {p.totals[metric].toLocaleString()}
                      </td>
                      {periodKeys.map((pk) => {
                        const val = p.periods[pk]?.[metric] || 0;
                        return (
                          <td key={pk} className={`text-center py-2 px-1 ${heatmapBg(val, maxVal)}`}>
                            <span className={val > 0 ? "text-white/80" : "text-gray-700"}>
                              {val > 0 ? val.toLocaleString() : ""}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && (
                      <tr key={`${p.page_path}-queries`}>
                        <td colSpan={3 + periodKeys.length} className="bg-white/[0.02] px-6 py-3">
                          {queriesForPage.length > 0 ? (
                            <div>
                              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                                検索クエリ（直近30日）
                              </p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500 border-b border-white/5">
                                    <th className="text-left py-1.5 pr-3">クエリ</th>
                                    <th className="text-right py-1.5 px-2 w-16">クリック</th>
                                    <th className="text-right py-1.5 px-2 w-16">表示</th>
                                    <th className="text-right py-1.5 px-2 w-16">CTR</th>
                                    <th className="text-right py-1.5 pl-2 w-14">順位</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {queriesForPage.map((q) => (
                                    <tr key={q.query} className="border-b border-white/5">
                                      <td className="py-1.5 pr-3 text-white">{q.query}</td>
                                      <td className="text-right py-1.5 px-2 text-white font-medium">{q.clicks}</td>
                                      <td className="text-right py-1.5 px-2 text-gray-400">{q.impressions.toLocaleString()}</td>
                                      <td className="text-right py-1.5 px-2 text-gray-400">{(q.ctr * 100).toFixed(1)}%</td>
                                      <td className="text-right py-1.5 pl-2">
                                        <span className={q.position <= 3 ? "text-green-400" : q.position <= 10 ? "text-yellow-400" : "text-gray-500"}>
                                          {q.position.toFixed(1)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-600">検索クエリデータなし</p>
                          )}
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

type TrafficRange = "7" | "30" | "90" | "custom";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface AggregatedTraffic {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  channel_group: string | null;
  sessions: number;
  users: number;
  new_users: number;
  schedule_visits: number;
}

function TrafficTabContent({ traffic, landingPage }: { traffic: TrafficDaily[]; landingPage: string }) {
  const [range, setRange] = useState<TrafficRange>("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const filtered = useMemo(() => {
    let fromDate: string;
    let toDate: string;

    if (range === "custom" && customFrom && customTo) {
      fromDate = customFrom;
      toDate = customTo;
    } else if (range === "custom") {
      fromDate = daysAgo(90);
      toDate = daysAgo(0);
    } else {
      fromDate = daysAgo(parseInt(range));
      toDate = daysAgo(0);
    }

    const rows = traffic.filter(
      (t) => t.landing_page === landingPage && t.date >= fromDate && t.date <= toDate
    );

    const map = new Map<string, AggregatedTraffic>();
    for (const row of rows) {
      const key = `${row.source}|${row.medium}|${row.campaign}`;
      const existing = map.get(key);
      if (existing) {
        existing.sessions += row.sessions;
        existing.users += row.users;
        existing.new_users += row.new_users;
        existing.schedule_visits += row.schedule_visits;
      } else {
        map.set(key, {
          source: row.source,
          medium: row.medium,
          campaign: row.campaign,
          channel_group: row.channel_group,
          sessions: row.sessions,
          users: row.users,
          new_users: row.new_users,
          schedule_visits: row.schedule_visits,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.sessions - a.sessions);
  }, [traffic, landingPage, range, customFrom, customTo]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">
          {landingPage === "/" ? "メインLP (/) 流入経路" : "YouTube LP (/lp3/) 流入経路"}
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {([["7", "1週間"], ["30", "1ヶ月"], ["90", "3ヶ月"], ["custom", "期間指定"]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setRange(v as TrafficRange)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  range === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
              />
              <span className="text-gray-500 text-xs">〜</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
              />
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400">
                <th className="text-left py-2.5 px-3">ソース</th>
                <th className="text-left py-2.5 px-3">メディア</th>
                <th className="text-left py-2.5 px-3">キャンペーン</th>
                <th className="text-right py-2.5 px-3">セッション</th>
                <th className="text-right py-2.5 px-3">ユーザー</th>
                <th className="text-right py-2.5 px-3">CV</th>
                <th className="text-right py-2.5 px-3">CVR</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const cvr = t.sessions > 0 ? (t.schedule_visits / t.sessions) * 100 : 0;
                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2.5 px-3 text-white">{t.source || "(direct)"}</td>
                    <td className="py-2.5 px-3 text-gray-300">{t.medium || "(none)"}</td>
                    <td className="py-2.5 px-3 text-gray-400 truncate max-w-[200px]">{t.campaign || "—"}</td>
                    <td className="text-right py-2.5 px-3 text-white font-medium">{t.sessions.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3 text-gray-300">{t.users.toLocaleString()}</td>
                    <td className="text-right py-2.5 px-3">
                      <span className={t.schedule_visits > 0 ? "text-green-400 font-medium" : "text-gray-600"}>
                        {t.schedule_visits}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className={cvr > 0 ? "text-green-400" : "text-gray-600"}>
                        {cvr > 0 ? `${cvr.toFixed(1)}%` : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">データがありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsClient({ pageDailyRows, traffic, searchQueries }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("pages");

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">マーケティング分析</h1>
        <p className="text-sm text-gray-500 mt-1">GA4 + Search Console</p>
      </div>

      <div className="flex gap-1 border-b border-white/10">
        <TabButton label="ページ別KPI" active={activeTab === "pages"} onClick={() => setActiveTab("pages")} />
        <TabButton label="メインLP流入" active={activeTab === "traffic_main"} onClick={() => setActiveTab("traffic_main")} />
        <TabButton label="YouTube LP流入" active={activeTab === "traffic_lp3"} onClick={() => setActiveTab("traffic_lp3")} />
      </div>

      {activeTab === "pages" && <PagesTab pageDailyRows={pageDailyRows} searchQueries={searchQueries} />}
      {activeTab === "traffic_main" && <TrafficTabContent traffic={traffic} landingPage="/" />}
      {activeTab === "traffic_lp3" && <TrafficTabContent traffic={traffic} landingPage="/lp3/" />}
    </div>
  );
}
