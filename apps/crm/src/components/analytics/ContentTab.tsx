"use client";

import { useState, useMemo } from "react";
import type { PageDailyRow } from "@/components/analytics/shared";
import { getWeekKey, heatmapBg, SITE_BASE } from "@/components/analytics/shared";

type ContentMetric = "pageviews" | "users" | "sessions" | "bounce_rate" | "avg_duration" | "pv_per_session";

const METRICS: { key: ContentMetric; label: string }[] = [
  { key: "pageviews", label: "PV" },
  { key: "users", label: "ユーザー" },
  { key: "sessions", label: "セッション" },
  { key: "bounce_rate", label: "直帰率" },
  { key: "avg_duration", label: "平均滞在" },
  { key: "pv_per_session", label: "PV/セッション" },
];

function formatVal(metric: ContentMetric, val: number): string {
  if (val === 0) return "";
  if (metric === "bounce_rate") return `${(val * 100).toFixed(0)}%`;
  if (metric === "avg_duration") {
    const m = Math.floor(val / 60);
    const s = Math.round(val % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  if (metric === "pv_per_session") return val.toFixed(1);
  return val.toLocaleString();
}

export function ContentTab({ pageDailyRows }: { pageDailyRows: PageDailyRow[] }) {
  const [metric, setMetric] = useState<ContentMetric>("users");

  // Filter to /contents/* and /voice/* only
  const contentRows = useMemo(
    () => pageDailyRows.filter((r) => r.page_path.startsWith("/contents/") || r.page_path.startsWith("/voice/")),
    [pageDailyRows]
  );

  // Get all weeks (sorted)
  const weeks = useMemo(() => {
    const set = new Set<string>();
    for (const r of contentRows) set.add(getWeekKey(r.date));
    return Array.from(set).sort();
  }, [contentRows]);

  // Build page × week matrix
  const { pages, matrix, maxVal } = useMemo(() => {
    const pageMap = new Map<string, {
      path: string;
      title: string;
      category: "contents" | "voice";
      totalPV: number;
      weekData: Map<string, { pv: number; users: number; sessions: number; bounce: number; bounceN: number; duration: number; durationN: number }>;
    }>();

    for (const r of contentRows) {
      const key = r.page_path;
      if (!pageMap.has(key)) {
        pageMap.set(key, {
          path: key,
          title: r.page_title || key,
          category: key.startsWith("/contents/") ? "contents" : "voice",
          totalPV: 0,
          weekData: new Map(),
        });
      }
      const page = pageMap.get(key)!;
      page.totalPV += r.pageviews;

      const wk = getWeekKey(r.date);
      if (!page.weekData.has(wk)) {
        page.weekData.set(wk, { pv: 0, users: 0, sessions: 0, bounce: 0, bounceN: 0, duration: 0, durationN: 0 });
      }
      const wd = page.weekData.get(wk)!;
      wd.pv += r.pageviews;
      wd.users += r.users;
      wd.sessions += r.sessions;
      if (r.bounce_rate != null) { wd.bounce += r.bounce_rate * r.sessions; wd.bounceN += r.sessions; }
      if (r.avg_session_duration) { wd.duration += r.avg_session_duration * r.sessions; wd.durationN += r.sessions; }
    }

    const sortedPages = Array.from(pageMap.values()).sort((a, b) => b.totalPV - a.totalPV);

    // Build matrix values and find max
    let mx = 0;
    const mtx = new Map<string, Map<string, number>>();
    for (const page of sortedPages) {
      const row = new Map<string, number>();
      for (const wk of weeks) {
        const wd = page.weekData.get(wk);
        let val = 0;
        if (wd) {
          switch (metric) {
            case "pageviews": val = wd.pv; break;
            case "users": val = wd.users; break;
            case "sessions": val = wd.sessions; break;
            case "bounce_rate": val = wd.bounceN > 0 ? wd.bounce / wd.bounceN : 0; break;
            case "avg_duration": val = wd.durationN > 0 ? wd.duration / wd.durationN : 0; break;
            case "pv_per_session": val = wd.sessions > 0 ? wd.pv / wd.sessions : 0; break;
          }
        }
        row.set(wk, val);
        if (val > mx) mx = val;
      }
      mtx.set(page.path, row);
    }

    return { pages: sortedPages, matrix: mtx, maxVal: mx };
  }, [contentRows, weeks, metric]);

  return (
    <div className="space-y-3">
      {/* KPIセレクタ */}
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

      {/* ヒートマップテーブル */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-3 py-2 text-gray-500 font-medium sticky left-0 bg-surface-raised min-w-[240px] z-10">
                ページ ({pages.length})
              </th>
              {weeks.map((wk) => (
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
              const displayTotal = metric === "bounce_rate" || metric === "avg_duration" || metric === "pv_per_session"
                ? total / (weeks.filter((wk) => (row.get(wk) || 0) > 0).length || 1)
                : total;

              return (
                <tr key={page.path} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-3 py-1.5 sticky left-0 bg-surface-raised z-10">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        page.category === "contents" ? "bg-purple-400" : "bg-teal-400"
                      }`} />
                      <a
                        href={SITE_BASE + page.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-300 hover:text-white truncate max-w-[220px]"
                        title={page.title}
                      >
                        {page.title.length > 35 ? page.title.substring(0, 35) + "..." : page.title}
                      </a>
                    </div>
                  </td>
                  {weeks.map((wk) => {
                    const val = row.get(wk) || 0;
                    return (
                      <td key={wk} className={`text-center px-2 py-1.5 text-gray-300 ${heatmapBg(val, maxVal)}`}>
                        {formatVal(metric, val)}
                      </td>
                    );
                  })}
                  <td className="text-center px-3 py-1.5 text-white font-medium bg-white/5">
                    {formatVal(metric, displayTotal)}
                  </td>
                </tr>
              );
            })}
            {/* 合計行 */}
            <tr className="border-t border-white/10 bg-white/5">
              <td className="px-3 py-2 text-gray-400 font-medium sticky left-0 bg-white/5 z-10">合計</td>
              {weeks.map((wk) => {
                let weekTotal = 0;
                for (const page of pages) {
                  weekTotal += matrix.get(page.path)?.get(wk) || 0;
                }
                if (metric === "bounce_rate" || metric === "avg_duration" || metric === "pv_per_session") {
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

      {/* 凡例 */}
      <div className="flex gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> コンテンツ (/contents/)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-400" /> インタビュー (/voice/)</span>
      </div>
    </div>
  );
}
