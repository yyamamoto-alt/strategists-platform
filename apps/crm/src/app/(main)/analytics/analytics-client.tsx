"use client";

import { useState, useMemo } from "react";
import type {
  PageAggregated,
  DailyTrend,
  TrafficDaily,
  SearchByPage,
} from "@/lib/data/analytics";

type Tab = "pages" | "traffic" | "search";

interface Props {
  aggregatedPages: PageAggregated[];
  dailyTrend: DailyTrend[];
  traffic: TrafficDaily[];
  searchByPage: SearchByPage[];
}

function TabButton({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
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
      {count !== undefined && (
        <span className="ml-1.5 text-xs text-gray-500">({count})</span>
      )}
    </button>
  );
}

// Simple SVG line chart
function TrendChart({ data, height = 200 }: { data: DailyTrend[]; height?: number }) {
  const [metric, setMetric] = useState<"sessions" | "pageviews" | "users">("sessions");

  if (data.length === 0) return null;

  const values = data.map((d) => d[metric]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const width = 900;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = values.map((v, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - ((v - min) / range) * chartH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  // Y-axis labels
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    value: Math.round(min + pct * range),
    y: padding.top + chartH - pct * chartH,
  }));

  // X-axis labels (every ~7 days)
  const step = Math.max(Math.floor(data.length / 12), 1);
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1).map((d, idx, arr) => ({
    label: d.date.slice(5), // MM-DD
    x: padding.left + ((data.indexOf(d)) / Math.max(data.length - 1, 1)) * chartW,
  }));

  const metricLabel = { sessions: "セッション", pageviews: "PV", users: "ユーザー" };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {(["sessions", "pageviews", "users"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              metric === m ? "bg-brand text-white" : "bg-white/5 text-gray-400 hover:text-white"
            }`}
          >
            {metricLabel[m]}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {yLabels.map((yl) => (
          <g key={yl.value}>
            <line x1={padding.left} y1={yl.y} x2={width - padding.right} y2={yl.y} stroke="rgba(255,255,255,0.06)" />
            <text x={padding.left - 8} y={yl.y + 4} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="11">
              {yl.value.toLocaleString()}
            </text>
          </g>
        ))}
        {/* X labels */}
        {xLabels.map((xl) => (
          <text key={xl.label} x={xl.x} y={height - 5} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10">
            {xl.label}
          </text>
        ))}
        {/* Area */}
        <path d={areaPath} fill="url(#gradient)" opacity={0.3} />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2} />
        {/* Dots */}
        {points.length <= 31 && points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#6366f1" />
        ))}
        <defs>
          <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function PagesTab({ pages, trend }: { pages: PageAggregated[]; trend: DailyTrend[] }) {
  const [filter, setFilter] = useState<"all" | "blog" | "lp">("all");
  const [sortBy, setSortBy] = useState<"pageviews" | "sessions" | "users" | "schedule_visits">("pageviews");

  const filtered = useMemo(() => {
    let result = pages;
    if (filter === "blog") result = pages.filter((p) => p.segment === "blog");
    if (filter === "lp") result = pages.filter((p) => p.segment !== "blog");
    return [...result].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
  }, [pages, filter, sortBy]);

  return (
    <div className="space-y-6">
      {/* Trend Chart */}
      <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-4">日別トレンド（過去90日）</h3>
        <TrendChart data={trend} />
      </div>

      {/* Filter + Table */}
      <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            {([["all", "全ページ"], ["blog", "ブログ"], ["lp", "LP/その他"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  filter === key ? "bg-white/10 text-white" : "text-gray-500 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">{filtered.length} ページ</p>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-raised z-10">
              <tr className="border-b border-white/10 text-gray-400 text-xs">
                <th className="text-left py-3 px-3 w-[45%]">ページ</th>
                <SortHeader label="PV" field="pageviews" current={sortBy} onSort={setSortBy} />
                <SortHeader label="セッション" field="sessions" current={sortBy} onSort={setSortBy} />
                <SortHeader label="ユーザー" field="users" current={sortBy} onSort={setSortBy} />
                <th className="text-right py-3 px-3">滞在</th>
                <SortHeader label="CV" field="schedule_visits" current={sortBy} onSort={setSortBy} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.page_path} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-2.5 px-3">
                    <p className="text-white truncate max-w-lg text-xs" title={p.page_title || ""}>
                      {p.page_title || p.page_path}
                    </p>
                    <p className="text-[10px] text-gray-600 truncate">{p.page_path}</p>
                  </td>
                  <td className="text-right py-2.5 px-3 text-white font-medium text-xs">{p.pageviews.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-gray-300 text-xs">{p.sessions.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-gray-300 text-xs">{p.users.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-gray-400 text-xs">
                    {p.avg_session_duration > 0 ? `${Math.round(p.avg_session_duration)}s` : "—"}
                  </td>
                  <td className="text-right py-2.5 px-3 text-xs">
                    <span className={p.schedule_visits > 0 ? "text-green-400 font-medium" : "text-gray-600"}>
                      {p.schedule_visits}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  field,
  current,
  onSort,
}: {
  label: string;
  field: string;
  current: string;
  onSort: (f: "pageviews" | "sessions" | "users" | "schedule_visits") => void;
}) {
  return (
    <th
      className="text-right py-3 px-3 cursor-pointer hover:text-white transition-colors select-none"
      onClick={() => onSort(field as "pageviews" | "sessions" | "users" | "schedule_visits")}
    >
      {label}
      {current === field && <span className="ml-0.5">▼</span>}
    </th>
  );
}

function TrafficTab({ traffic }: { traffic: TrafficDaily[] }) {
  const [lpFilter, setLpFilter] = useState<"all" | "/" | "/lp3/">("all");

  const filtered = useMemo(() => {
    if (lpFilter === "all") return traffic;
    return traffic.filter((t) => t.landing_page === lpFilter);
  }, [traffic, lpFilter]);

  return (
    <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-300">LP流入経路（過去90日）</h3>
        <div className="flex gap-2">
          {([["all", "全LP"], ["/", "メインLP (/)"], ["/lp3/", "YouTube LP (/lp3/)"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLpFilter(key as "all" | "/" | "/lp3/")}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                lpFilter === key ? "bg-white/10 text-white" : "text-gray-500 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-raised z-10">
            <tr className="border-b border-white/10 text-gray-400 text-xs">
              <th className="text-left py-3 px-3">LP</th>
              <th className="text-left py-3 px-3">ソース</th>
              <th className="text-left py-3 px-3">メディア</th>
              <th className="text-left py-3 px-3">キャンペーン</th>
              <th className="text-right py-3 px-3">セッション</th>
              <th className="text-right py-3 px-3">ユーザー</th>
              <th className="text-right py-3 px-3">CV</th>
              <th className="text-right py-3 px-3">CVR</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => {
              const cvr = t.sessions > 0 ? (t.schedule_visits / t.sessions) * 100 : 0;
              return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-2.5 px-3 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      t.landing_page === "/" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"
                    }`}>
                      {t.landing_page === "/" ? "メインLP" : "YouTube LP"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-white text-xs">{t.source || "(direct)"}</td>
                  <td className="py-2.5 px-3 text-gray-300 text-xs">{t.medium || "(none)"}</td>
                  <td className="py-2.5 px-3 text-gray-400 text-xs truncate max-w-[180px]">{t.campaign || "—"}</td>
                  <td className="text-right py-2.5 px-3 text-white font-medium text-xs">{t.sessions.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-gray-300 text-xs">{t.users.toLocaleString()}</td>
                  <td className="text-right py-2.5 px-3 text-xs">
                    <span className={t.schedule_visits > 0 ? "text-green-400 font-medium" : "text-gray-600"}>
                      {t.schedule_visits}
                    </span>
                  </td>
                  <td className="text-right py-2.5 px-3 text-xs">
                    <span className={cvr > 0 ? "text-green-400" : "text-gray-600"}>
                      {cvr > 0 ? `${cvr.toFixed(1)}%` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SearchTab({ searchByPage }: { searchByPage: SearchByPage[] }) {
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  return (
    <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-300">検索クエリ（直近30日、クリック1以上）</h3>
        <p className="text-xs text-gray-500">{searchByPage.length} ページ</p>
      </div>

      <div className="space-y-1 max-h-[700px] overflow-y-auto">
        {searchByPage.map((page) => {
          const isExpanded = expandedPage === page.page_path;
          return (
            <div key={page.page_path} className="border border-white/5 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedPage(isExpanded ? null : page.page_path)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{page.page_path}</p>
                </div>
                <div className="flex items-center gap-4 ml-4 shrink-0">
                  <span className="text-xs text-gray-400">{page.queries.length} クエリ</span>
                  <span className="text-xs text-white font-medium">{page.total_clicks} クリック</span>
                  <span className="text-gray-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-gray-500">
                        <th className="text-left py-2 pr-3">クエリ</th>
                        <th className="text-right py-2 px-2">クリック</th>
                        <th className="text-right py-2 px-2">表示</th>
                        <th className="text-right py-2 px-2">CTR</th>
                        <th className="text-right py-2 pl-2">順位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.queries.map((q) => (
                        <tr key={q.query} className="border-b border-white/5">
                          <td className="py-2 pr-3 text-white">{q.query}</td>
                          <td className="text-right py-2 px-2 text-white font-medium">{q.clicks}</td>
                          <td className="text-right py-2 px-2 text-gray-400">{q.impressions.toLocaleString()}</td>
                          <td className="text-right py-2 px-2 text-gray-400">{(q.ctr * 100).toFixed(1)}%</td>
                          <td className="text-right py-2 pl-2">
                            <span className={q.position <= 3 ? "text-green-400" : q.position <= 10 ? "text-yellow-400" : "text-gray-500"}>
                              {q.position.toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsClient({ aggregatedPages, dailyTrend, traffic, searchByPage }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("pages");

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">マーケティング分析</h1>
        <p className="text-sm text-gray-500 mt-1">GA4 + Search Console</p>
      </div>

      <div className="flex gap-1 border-b border-white/10">
        <TabButton label="ページ別KPI" active={activeTab === "pages"} onClick={() => setActiveTab("pages")} count={aggregatedPages.length} />
        <TabButton label="LP流入経路" active={activeTab === "traffic"} onClick={() => setActiveTab("traffic")} count={traffic.length} />
        <TabButton label="検索クエリ" active={activeTab === "search"} onClick={() => setActiveTab("search")} count={searchByPage.length} />
      </div>

      {activeTab === "pages" && <PagesTab pages={aggregatedPages} trend={dailyTrend} />}
      {activeTab === "traffic" && <TrafficTab traffic={traffic} />}
      {activeTab === "search" && <SearchTab searchByPage={searchByPage} />}
    </div>
  );
}
