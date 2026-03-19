"use client";

import { useState, useMemo } from "react";
import type { TrafficDaily, Period, PageDailyRow } from "./shared";
import {
  getWeekKey,
  getMonthKey,
  periodLabel,
  heatmapBg,
  SubTab,
} from "./shared";

/* ───────── LP Tab Container ───────── */
import { ContentTab } from "./ContentTab";

interface LpTabProps {
  traffic: TrafficDaily[];
  pageDailyRows?: PageDailyRow[];
}

export function LpTab({ traffic, pageDailyRows }: LpTabProps) {
  const [lpTab, setLpTab] = useState<"main" | "lp3" | "content">("content");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <SubTab label="ページ別分析" active={lpTab === "content"} onClick={() => setLpTab("content")} />
        <SubTab label="メインLP" active={lpTab === "main"} onClick={() => setLpTab("main")} />
        <SubTab label="面談申込特化LP" active={lpTab === "lp3"} onClick={() => setLpTab("lp3")} />
      </div>
      {lpTab === "main" && <LpTrafficTrendTab traffic={traffic} landingPage="/" />}
      {lpTab === "lp3" && <LpTrafficTrendTab traffic={traffic} landingPage="/lp3/" />}
      {lpTab === "content" && pageDailyRows && <ContentTab pageDailyRows={pageDailyRows} traffic={traffic} />}
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
  const [period, setPeriod] = useState<Period>("month");
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
      periodKeys: Array.from(allPKs).sort().reverse(),
    };
  }, [lpRows, period, metric]);

  const maxVal = useMemo(() => {
    let mv = 0;
    for (const s of sources) for (const prd of Object.values(s.periods)) if (prd[metric] > mv) mv = prd[metric];
    return mv;
  }, [sources, metric]);

  // アド系/オーガニック系の分類
  const AD_KEYWORDS = ["cpc", "ads", "facebook", "fb", "instagram", "ig", "paid"];
  const isAdSource = (src: AggregatedTrafficSource) => {
    const s = (src.source || "").toLowerCase();
    const m = (src.medium || "").toLowerCase();
    return AD_KEYWORDS.some(kw => s.includes(kw) || m.includes(kw));
  };

  const adSources = useMemo(() => sources.filter(isAdSource), [sources]);
  const organicSources = useMemo(() => sources.filter(s => !isAdSource(s)), [sources]);

  const adMaxVal = useMemo(() => {
    let mv = 0;
    for (const s of adSources) for (const prd of Object.values(s.periods)) if (prd[metric] > mv) mv = prd[metric];
    return mv;
  }, [adSources, metric]);

  const organicMaxVal = useMemo(() => {
    let mv = 0;
    for (const s of organicSources) for (const prd of Object.values(s.periods)) if (prd[metric] > mv) mv = prd[metric];
    return mv;
  }, [organicSources, metric]);

  const lpLabel = landingPage === "/" ? "メインLP (/)" : "面談申込特化LP (/lp3/)";

  return (
    <div className="space-y-4">
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
      {landingPage === "/" ? (
        <>
          {/* 広告流入 */}
          <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h4 className="text-sm font-medium text-amber-400">広告流入</h4>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
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
                  {adSources.map(s => (
                    <tr key={s.label} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2 px-3">
                        <p className="text-white">{s.source || "(direct)"}</p>
                        <p className="text-[10px] text-gray-600">{s.medium || "(none)"}</p>
                      </td>
                      <td className="text-right py-2 px-2 text-white font-medium">{s.totals[metric].toLocaleString()}</td>
                      {periodKeys.map(pk => {
                        const val = s.periods[pk]?.[metric] || 0;
                        return (
                          <td key={pk} className={`text-center py-2 px-1 ${heatmapBg(val, adMaxVal)}`}>
                            <span className={val > 0 ? "text-white/80" : "text-gray-700"}>{val > 0 ? val.toLocaleString() : ""}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {adSources.length === 0 && <tr><td colSpan={2 + periodKeys.length} className="py-4 text-center text-gray-500">広告流入データなし</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* オーガニック流入 */}
          <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h4 className="text-sm font-medium text-green-400">オーガニック流入</h4>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
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
                  {organicSources.map(s => (
                    <tr key={s.label} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2 px-3">
                        <p className="text-white">{s.source || "(direct)"}</p>
                        <p className="text-[10px] text-gray-600">{s.medium || "(none)"}</p>
                      </td>
                      <td className="text-right py-2 px-2 text-white font-medium">{s.totals[metric].toLocaleString()}</td>
                      {periodKeys.map(pk => {
                        const val = s.periods[pk]?.[metric] || 0;
                        return (
                          <td key={pk} className={`text-center py-2 px-1 ${heatmapBg(val, organicMaxVal)}`}>
                            <span className={val > 0 ? "text-white/80" : "text-gray-700"}>{val > 0 ? val.toLocaleString() : ""}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {organicSources.length === 0 && <tr><td colSpan={2 + periodKeys.length} className="py-4 text-center text-gray-500">オーガニック流入データなし</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
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
      )}
    </div>
  );
}
