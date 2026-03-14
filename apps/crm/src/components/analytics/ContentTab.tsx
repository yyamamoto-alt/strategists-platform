"use client";

import { useState, useMemo } from "react";
import type { PageDailyRow } from "@/components/analytics/shared";
import { SubTab, KpiCard, getWeekKey, heatmapBg, trendArrow, SITE_BASE } from "@/components/analytics/shared";

type ContentSub = "overview" | "pages" | "trends";
type ContentCategory = "all" | "contents" | "voice";

const CATEGORY_LABELS: Record<ContentCategory, string> = {
  all: "すべて",
  contents: "コンテンツ",
  voice: "インタビュー",
};

function categorize(path: string): ContentCategory | null {
  if (path.startsWith("/contents/")) return "contents";
  if (path.startsWith("/voice/")) return "voice";
  return null;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ContentTab({ pageDailyRows }: { pageDailyRows: PageDailyRow[] }) {
  const [sub, setSub] = useState<ContentSub>("overview");
  const [category, setCategory] = useState<ContentCategory>("all");

  // Filter to content/voice pages only
  const contentRows = useMemo(
    () => pageDailyRows.filter((r) => categorize(r.page_path) !== null),
    [pageDailyRows]
  );

  const filteredRows = useMemo(
    () => category === "all" ? contentRows : contentRows.filter((r) => categorize(r.page_path) === category),
    [contentRows, category]
  );

  // Aggregate by page
  const pageAggregates = useMemo(() => {
    const map = new Map<string, {
      path: string;
      title: string;
      category: ContentCategory;
      totalPV: number;
      totalSessions: number;
      totalUsers: number;
      totalCV: number;
      totalDuration: number;
      durationCount: number;
      totalBounce: number;
      bounceCount: number;
      days: number;
    }>();

    for (const r of filteredRows) {
      const key = r.page_path;
      const existing = map.get(key);
      if (existing) {
        existing.totalPV += r.pageviews;
        existing.totalSessions += r.sessions;
        existing.totalUsers += r.users;
        existing.totalCV += r.schedule_visits || 0;
        if (r.avg_session_duration) {
          existing.totalDuration += r.avg_session_duration * r.sessions;
          existing.durationCount += r.sessions;
        }
        if (r.bounce_rate != null) {
          existing.totalBounce += r.bounce_rate * r.sessions;
          existing.bounceCount += r.sessions;
        }
        existing.days++;
      } else {
        map.set(key, {
          path: key,
          title: r.page_title || key,
          category: categorize(key) || "contents",
          totalPV: r.pageviews,
          totalSessions: r.sessions,
          totalUsers: r.users,
          totalCV: r.schedule_visits || 0,
          totalDuration: (r.avg_session_duration || 0) * r.sessions,
          durationCount: r.avg_session_duration ? r.sessions : 0,
          totalBounce: (r.bounce_rate ?? 0) * r.sessions,
          bounceCount: r.bounce_rate != null ? r.sessions : 0,
          days: 1,
        });
      }
    }

    return Array.from(map.values())
      .map((p) => ({
        ...p,
        avgDuration: p.durationCount > 0 ? p.totalDuration / p.durationCount : 0,
        avgBounce: p.bounceCount > 0 ? p.totalBounce / p.bounceCount : 0,
        cvr: p.totalSessions > 0 ? p.totalCV / p.totalSessions : 0,
      }))
      .sort((a, b) => b.totalPV - a.totalPV);
  }, [filteredRows]);

  // Weekly aggregates
  const weeklyData = useMemo(() => {
    const map = new Map<string, {
      week: string;
      pv: number;
      users: number;
      sessions: number;
      cv: number;
      contentsPV: number;
      voicePV: number;
    }>();

    for (const r of contentRows) {
      const wk = getWeekKey(r.date);
      const existing = map.get(wk);
      const cat = categorize(r.page_path);
      if (existing) {
        existing.pv += r.pageviews;
        existing.users += r.users;
        existing.sessions += r.sessions;
        existing.cv += r.schedule_visits || 0;
        if (cat === "contents") existing.contentsPV += r.pageviews;
        if (cat === "voice") existing.voicePV += r.pageviews;
      } else {
        map.set(wk, {
          week: wk,
          pv: r.pageviews,
          users: r.users,
          sessions: r.sessions,
          cv: r.schedule_visits || 0,
          contentsPV: cat === "contents" ? r.pageviews : 0,
          voicePV: cat === "voice" ? r.pageviews : 0,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.week.localeCompare(b.week));
  }, [contentRows]);

  // KPI totals
  const totals = useMemo(() => {
    let pv = 0, users = 0, sessions = 0, cv = 0;
    for (const r of filteredRows) {
      pv += r.pageviews;
      users += r.users;
      sessions += r.sessions;
      cv += r.schedule_visits || 0;
    }
    return { pv, users, sessions, cv };
  }, [filteredRows]);

  // Previous period for trend comparison
  const prevTotals = useMemo(() => {
    if (weeklyData.length < 2) return { pv: 0, users: 0 };
    const latest = weeklyData[weeklyData.length - 1];
    const prev = weeklyData[weeklyData.length - 2];
    return { pv: prev.pv, users: prev.users, latestPV: latest.pv, latestUsers: latest.users };
  }, [weeklyData]);

  const maxWeeklyPV = useMemo(() => Math.max(...weeklyData.map((w) => w.pv), 1), [weeklyData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <SubTab label="概要" active={sub === "overview"} onClick={() => setSub("overview")} />
          <SubTab label="ページ別" active={sub === "pages"} onClick={() => setSub("pages")} />
          <SubTab label="週次トレンド" active={sub === "trends"} onClick={() => setSub("trends")} />
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {(["all", "contents", "voice"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                category === c ? "bg-brand text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {/* 概要 */}
      {sub === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <KpiCard
              title="合計PV"
              value={totals.pv.toLocaleString()}
              sub={prevTotals.pv > 0 ? trendArrow(prevTotals.latestPV || 0, prevTotals.pv) : <span className="text-xs text-gray-500">先週比</span>}
            />
            <KpiCard
              title="ユーザー数"
              value={totals.users.toLocaleString()}
              sub={prevTotals.users > 0 ? trendArrow(prevTotals.latestUsers || 0, prevTotals.users) : <span className="text-xs text-gray-500">先週比</span>}
            />
            <KpiCard
              title="セッション"
              value={totals.sessions.toLocaleString()}
              sub={<span className="text-xs text-gray-500">全期間</span>}
            />
            <KpiCard
              title="ページ数"
              value={pageAggregates.length.toString()}
              sub={<span className="text-xs text-gray-500">
                コンテンツ {pageAggregates.filter((p) => p.category === "contents").length} / インタビュー {pageAggregates.filter((p) => p.category === "voice").length}
              </span>}
            />
          </div>

          {/* Top Pages */}
          <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3">人気ページ TOP10</h3>
            <div className="space-y-1">
              {pageAggregates.slice(0, 10).map((p, i) => {
                const maxPV = pageAggregates[0]?.totalPV || 1;
                const barWidth = (p.totalPV / maxPV) * 100;
                return (
                  <div key={p.path} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs text-gray-500 w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          p.category === "contents" ? "bg-purple-500/20 text-purple-300" : "bg-teal-500/20 text-teal-300"
                        }`}>
                          {p.category === "contents" ? "コンテンツ" : "インタビュー"}
                        </span>
                        <a
                          href={SITE_BASE + p.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-300 hover:text-white truncate"
                          title={p.title}
                        >
                          {p.title.length > 50 ? p.title.substring(0, 50) + "..." : p.title}
                        </a>
                      </div>
                      <div className="mt-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand/50 rounded-full"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0 w-20">
                      <span className="text-sm font-medium text-white">{p.totalPV}</span>
                      <span className="text-xs text-gray-500 ml-1">PV</span>
                    </div>
                    <div className="text-right shrink-0 w-16">
                      <span className="text-xs text-gray-400">{p.totalUsers} users</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mini weekly chart */}
          <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3">週次PV推移（コンテンツ vs インタビュー）</h3>
            <div className="flex items-end gap-1 h-32">
              {weeklyData.slice(-12).map((w) => {
                const contentsH = (w.contentsPV / maxWeeklyPV) * 100;
                const voiceH = (w.voicePV / maxWeeklyPV) * 100;
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center gap-0">
                    <div className="w-full flex flex-col justify-end" style={{ height: "100px" }}>
                      <div className="bg-teal-500/60 rounded-t" style={{ height: `${voiceH}%` }} title={`Voice: ${w.voicePV}`} />
                      <div className="bg-purple-500/60 rounded-t" style={{ height: `${contentsH}%` }} title={`Contents: ${w.contentsPV}`} />
                    </div>
                    <span className="text-[9px] text-gray-500 mt-1">{w.week.slice(5)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 justify-center">
              <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <span className="w-2.5 h-2.5 rounded bg-purple-500/60" /> コンテンツ
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <span className="w-2.5 h-2.5 rounded bg-teal-500/60" /> インタビュー
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ページ別詳細 */}
      {sub === "pages" && (
        <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">ページ</th>
                <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">PV</th>
                <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">ユーザー</th>
                <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">セッション</th>
                <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">平均滞在</th>
                <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">直帰率</th>
                <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">PV/日</th>
              </tr>
            </thead>
            <tbody>
              {pageAggregates.map((p) => (
                <tr key={p.path} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                        p.category === "contents" ? "bg-purple-500/20 text-purple-300" : "bg-teal-500/20 text-teal-300"
                      }`}>
                        {p.category === "contents" ? "記事" : "声"}
                      </span>
                      <a
                        href={SITE_BASE + p.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-300 hover:text-white truncate max-w-sm"
                        title={p.title}
                      >
                        {p.title.length > 45 ? p.title.substring(0, 45) + "..." : p.title}
                      </a>
                    </div>
                  </td>
                  <td className="text-right px-3 py-2 text-white font-medium">{p.totalPV}</td>
                  <td className="text-right px-3 py-2 text-gray-300">{p.totalUsers}</td>
                  <td className="text-right px-3 py-2 text-gray-300">{p.totalSessions}</td>
                  <td className="text-right px-3 py-2 text-gray-400">{formatDuration(p.avgDuration)}</td>
                  <td className="text-right px-3 py-2 text-gray-400">
                    {p.avgBounce > 0 ? `${(p.avgBounce * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="text-right px-3 py-2 text-gray-400">
                    {p.days > 0 ? (p.totalPV / p.days).toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 週次トレンド */}
      {sub === "trends" && (
        <div className="space-y-4">
          <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">週</th>
                  <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">合計PV</th>
                  <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">コンテンツ</th>
                  <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">インタビュー</th>
                  <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">ユーザー</th>
                  <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">セッション</th>
                  <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">前週比</th>
                </tr>
              </thead>
              <tbody>
                {weeklyData.slice(-12).reverse().map((w, i, arr) => {
                  const prev = arr[i + 1];
                  return (
                    <tr key={w.week} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-2 text-gray-300">{w.week}</td>
                      <td className={`text-right px-3 py-2 font-medium text-white ${heatmapBg(w.pv, maxWeeklyPV)}`}>
                        {w.pv}
                      </td>
                      <td className="text-right px-3 py-2 text-purple-300">{w.contentsPV}</td>
                      <td className="text-right px-3 py-2 text-teal-300">{w.voicePV}</td>
                      <td className="text-right px-3 py-2 text-gray-300">{w.users}</td>
                      <td className="text-right px-3 py-2 text-gray-400">{w.sessions}</td>
                      <td className="text-right px-3 py-2">
                        {prev ? trendArrow(w.pv, prev.pv) : <span className="text-gray-600">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Page-level weekly heatmap */}
          <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3">ページ別 × 週次ヒートマップ</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-2 py-1.5 text-gray-500 font-medium sticky left-0 bg-surface-raised min-w-[200px]">ページ</th>
                    {weeklyData.slice(-8).map((w) => (
                      <th key={w.week} className="text-center px-2 py-1.5 text-gray-500 font-medium min-w-[60px]">
                        {w.week.slice(5)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Build page×week matrix
                    const weeks = weeklyData.slice(-8).map((w) => w.week);
                    const pageWeekMap = new Map<string, Map<string, number>>();
                    let maxVal = 0;

                    for (const r of filteredRows) {
                      const wk = getWeekKey(r.date);
                      if (!weeks.includes(wk)) continue;
                      const key = r.page_path;
                      if (!pageWeekMap.has(key)) pageWeekMap.set(key, new Map());
                      const cur = (pageWeekMap.get(key)!.get(wk) || 0) + r.pageviews;
                      pageWeekMap.get(key)!.set(wk, cur);
                      if (cur > maxVal) maxVal = cur;
                    }

                    // Sort by total PV
                    const sortedPages = Array.from(pageWeekMap.entries())
                      .map(([path, weekMap]) => ({
                        path,
                        title: pageAggregates.find((p) => p.path === path)?.title || path,
                        category: categorize(path),
                        weekMap,
                        total: Array.from(weekMap.values()).reduce((a, b) => a + b, 0),
                      }))
                      .sort((a, b) => b.total - a.total)
                      .slice(0, 15);

                    return sortedPages.map((page) => (
                      <tr key={page.path} className="border-b border-white/5">
                        <td className="px-2 py-1.5 sticky left-0 bg-surface-raised">
                          <span className="text-gray-300 truncate block max-w-[200px]" title={page.title}>
                            {page.title.length > 30 ? page.title.substring(0, 30) + "..." : page.title}
                          </span>
                        </td>
                        {weeks.map((wk) => {
                          const val = page.weekMap.get(wk) || 0;
                          return (
                            <td key={wk} className={`text-center px-2 py-1.5 text-gray-300 ${heatmapBg(val, maxVal)}`}>
                              {val || ""}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
