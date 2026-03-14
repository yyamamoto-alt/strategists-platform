"use client";

import { useState, useMemo, Fragment } from "react";
import type { PageDailyRow, TrafficDaily } from "@/components/analytics/shared";
import { getWeekKey, getMonthKey, heatmapBg, SITE_BASE } from "@/components/analytics/shared";

type Granularity = "weekly" | "monthly";

type ContentMetric = "users" | "avg_duration" | "bounce_rate" | "cvr";

const METRICS: { key: ContentMetric; label: string }[] = [
  { key: "users", label: "ユーザー" },
  { key: "avg_duration", label: "平均滞在" },
  { key: "bounce_rate", label: "直帰率" },
  { key: "cvr", label: "CVR" },
];

function formatVal(metric: ContentMetric, val: number): string {
  if (val === 0) return "";
  if (metric === "bounce_rate" || metric === "cvr") return `${(val * 100).toFixed(1)}%`;
  if (metric === "avg_duration") {
    const m = Math.floor(val / 60);
    const s = Math.round(val % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  return val.toLocaleString();
}

// Normalize path: remove trailing slash for matching
function normPath(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

// Check if a path is a content/voice page
function isContentPage(p: string): boolean {
  const n = normPath(p);
  if (n === "/" || n.startsWith("/blog") || n.startsWith("/lp") || n.startsWith("/schedule")) return false;
  return n.startsWith("/contents") || n.startsWith("/voice") ||
         n.startsWith("/keikensha") || n.startsWith("/kaihatsutaidan");
}

export function ContentTab({ pageDailyRows, traffic }: { pageDailyRows: PageDailyRow[]; traffic?: TrafficDaily[] }) {
  const [metric, setMetric] = useState<ContentMetric>("users");
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  const contentRows = useMemo(
    () => pageDailyRows.filter((r) => isContentPage(r.page_path)),
    [pageDailyRows]
  );

  const periodKey = granularity === "weekly" ? getWeekKey : getMonthKey;

  const periods = useMemo(() => {
    const set = new Set<string>();
    for (const r of contentRows) set.add(periodKey(r.date));
    return Array.from(set).sort().reverse(); // newest first
  }, [contentRows, periodKey]);

  // Traffic by page (for referrer detail)
  const trafficByPage = useMemo(() => {
    const map = new Map<string, { source: string; medium: string; sessions: number; users: number; cv: number }[]>();
    if (!traffic) return map;
    for (const t of traffic) {
      if (!isContentPage(t.landing_page)) continue;
      const lp = normPath(t.landing_page);
      if (!map.has(lp)) map.set(lp, []);
      map.get(lp)!.push({
        source: t.source || "(direct)",
        medium: t.medium || "(none)",
        sessions: t.sessions,
        users: t.users,
        cv: t.schedule_visits || 0,
      });
    }
    // Aggregate by source/medium
    const result = new Map<string, { source: string; medium: string; sessions: number; users: number; cv: number }[]>();
    for (const [page, rows] of map) {
      const agg = new Map<string, { source: string; medium: string; sessions: number; users: number; cv: number }>();
      for (const r of rows) {
        const key = `${r.source}/${r.medium}`;
        const cur = agg.get(key) || { source: r.source, medium: r.medium, sessions: 0, users: 0, cv: 0 };
        cur.sessions += r.sessions;
        cur.users += r.users;
        cur.cv += r.cv;
        agg.set(key, cur);
      }
      result.set(page, Array.from(agg.values()).sort((a, b) => b.sessions - a.sessions));
    }
    return result;
  }, [traffic, periodKey]);

  // Build CV data from traffic
  const cvByPageWeek = useMemo(() => {
    const map = new Map<string, Map<string, { cv: number; sessions: number }>>();
    if (!traffic) return map;
    for (const t of traffic) {
      if (!isContentPage(t.landing_page)) continue;
      const lp = normPath(t.landing_page);
      const wk = periodKey(t.date);
      if (!map.has(lp)) map.set(lp, new Map());
      const m = map.get(lp)!;
      const cur = m.get(wk) || { cv: 0, sessions: 0 };
      cur.cv += t.schedule_visits || 0;
      cur.sessions += t.sessions;
      m.set(wk, cur);
    }
    return map;
  }, [traffic, periodKey]);

  const { pages, matrix, maxVal } = useMemo(() => {
    const pageMap = new Map<string, {
      path: string;
      title: string;
      category: "contents" | "voice";
      totalUsers: number;
      weekData: Map<string, { users: number; sessions: number; bounce: number; bounceN: number; duration: number; durationN: number; cv: number }>;
    }>();

    for (const r of contentRows) {
      const key = r.page_path;
      if (!pageMap.has(key)) {
        pageMap.set(key, {
          path: key,
          title: r.page_title || key,
          category: key.startsWith("/contents/") ? "contents" : "voice",
          totalUsers: 0,
          weekData: new Map(),
        });
      }
      const page = pageMap.get(key)!;
      page.totalUsers += r.users;

      const wk = periodKey(r.date);
      if (!page.weekData.has(wk)) {
        page.weekData.set(wk, { users: 0, sessions: 0, bounce: 0, bounceN: 0, duration: 0, durationN: 0, cv: 0 });
      }
      const wd = page.weekData.get(wk)!;
      wd.users += r.users;
      wd.sessions += r.sessions;
      if (r.bounce_rate != null) { wd.bounce += r.bounce_rate * r.sessions; wd.bounceN += r.sessions; }
      if (r.avg_session_duration) { wd.duration += r.avg_session_duration * r.sessions; wd.durationN += r.sessions; }
      const cvData = cvByPageWeek.get(normPath(key))?.get(wk);
      if (cvData) wd.cv = cvData.cv;
    }

    const sortedPages = Array.from(pageMap.values()).sort((a, b) => b.totalUsers - a.totalUsers);

    let mx = 0;
    const mtx = new Map<string, Map<string, number>>();
    for (const page of sortedPages) {
      const row = new Map<string, number>();
      for (const wk of periods) {
        const wd = page.weekData.get(wk);
        let val = 0;
        if (wd) {
          switch (metric) {
            case "users": val = wd.users; break;
            case "bounce_rate": val = wd.bounceN > 0 ? wd.bounce / wd.bounceN : 0; break;
            case "avg_duration": val = wd.durationN > 0 ? wd.duration / wd.durationN : 0; break;
            case "cvr": val = wd.sessions > 0 ? wd.cv / wd.sessions : 0; break;
          }
        }
        row.set(wk, val);
        if (val > mx) mx = val;
      }
      mtx.set(page.path, row);
    }

    return { pages: sortedPages, matrix: mtx, maxVal: mx };
  }, [contentRows, periods, metric, cvByPageWeek, periodKey]);

  const colCount = periods.length + 2; // page col + weeks + total

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 w-fit">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                metric === m.key ? "bg-brand text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {([["weekly", "週別"], ["monthly", "月別"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setGranularity(v)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${granularity === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-3 py-2 text-gray-500 font-medium sticky left-0 bg-surface-raised min-w-[300px] z-10">
                ページ ({pages.length})
              </th>
              {periods.map((wk) => (
                <th key={wk} className="text-center px-2 py-2 text-gray-500 font-medium min-w-[56px] whitespace-nowrap">
                  {wk.slice(5)}
                </th>
              ))}
              <th className="text-center px-3 py-2 text-gray-500 font-medium min-w-[56px]">合計</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => {
              const row = matrix.get(page.path)!;
              const total = Array.from(row.values()).reduce((a, b) => a + b, 0);
              const weeksWithData = periods.filter((wk) => (row.get(wk) || 0) > 0).length;
              const displayTotal = metric === "bounce_rate" || metric === "avg_duration" || metric === "cvr"
                ? (weeksWithData > 0 ? total / weeksWithData : 0)
                : total;
              const isExpanded = expandedPage === page.path;
              const referrers = trafficByPage.get(normPath(page.path)) || [];

              return (
                <Fragment key={page.path}>
                  <tr
                    className={`border-b border-white/5 hover:bg-white/5 cursor-pointer ${isExpanded ? "bg-white/5" : ""}`}
                    onClick={() => setExpandedPage(isExpanded ? null : page.path)}
                  >
                    <td className="px-3 py-2 sticky left-0 bg-surface-raised z-10">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          page.category === "contents" ? "bg-purple-400" : "bg-teal-400"
                        }`} />
                        <div className="min-w-0">
                          <div className="text-gray-300 truncate max-w-[260px]" title={page.title}>
                            {page.title.length > 38 ? page.title.substring(0, 38) + "..." : page.title}
                          </div>
                          <a
                            href={SITE_BASE + page.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-gray-500 hover:text-brand"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {page.path}
                          </a>
                        </div>
                      </div>
                    </td>
                    {periods.map((wk) => {
                      const val = row.get(wk) || 0;
                      return (
                        <td key={wk} className={`text-center px-2 py-2 text-gray-300 ${heatmapBg(val, maxVal)}`}>
                          {formatVal(metric, val)}
                        </td>
                      );
                    })}
                    <td className="text-center px-3 py-2 text-white font-medium bg-white/5">
                      {formatVal(metric, displayTotal)}
                    </td>
                  </tr>

                  {/* 展開: 流入元詳細 */}
                  {isExpanded && (
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      <td colSpan={colCount} className="px-6 py-3">
                        <div className="max-w-lg">
                          <p className="text-[10px] text-gray-500 font-medium mb-2">流入元（ランディングページとしての流入）</p>
                          {referrers.length === 0 ? (
                            <p className="text-[10px] text-gray-600">データなし（次回同期後に表示されます）</p>
                          ) : (
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="border-b border-white/10">
                                  <th className="text-left py-1 text-gray-500">ソース / メディア</th>
                                  <th className="text-right py-1 px-2 text-gray-500">セッション</th>
                                  <th className="text-right py-1 px-2 text-gray-500">ユーザー</th>
                                  <th className="text-right py-1 px-2 text-gray-500">CV</th>
                                </tr>
                              </thead>
                              <tbody>
                                {referrers.slice(0, 10).map((ref, i) => (
                                  <tr key={i} className="border-b border-white/5">
                                    <td className="py-1 text-gray-300">{ref.source} / {ref.medium}</td>
                                    <td className="text-right py-1 px-2 text-gray-400">{ref.sessions}</td>
                                    <td className="text-right py-1 px-2 text-gray-400">{ref.users}</td>
                                    <td className="text-right py-1 px-2 text-gray-400">{ref.cv || ""}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            <tr className="border-t border-white/10 bg-white/5">
              <td className="px-3 py-2 text-gray-400 font-medium sticky left-0 bg-white/5 z-10">合計</td>
              {periods.map((wk) => {
                let weekTotal = 0;
                for (const page of pages) {
                  weekTotal += matrix.get(page.path)?.get(wk) || 0;
                }
                if (metric === "bounce_rate" || metric === "avg_duration" || metric === "cvr") {
                  weekTotal = pages.length > 0 ? weekTotal / pages.length : 0;
                }
                return (
                  <td key={wk} className="text-center px-2 py-2 text-white font-medium">
                    {formatVal(metric, weekTotal)}
                  </td>
                );
              })}
              <td className="text-center px-3 py-2 text-white font-bold" />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> コンテンツ (/contents/)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-400" /> インタビュー (/voice/)</span>
        <span className="text-gray-600">行をクリックで流入元を表示</span>
      </div>
    </div>
  );
}
