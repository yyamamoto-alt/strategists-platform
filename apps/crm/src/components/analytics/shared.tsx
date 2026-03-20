"use client";

import { useState } from "react";
import type {
  PageDailyRow,
  TrafficDaily,
  SearchQueryRow,
  SearchDailyRow,
  HourlyRow,
  AdsCampaignDaily,
  AdsKeywordDaily,
  AdsFunnelCustomer,
  MetaCampaignDaily,
  MetaAdsetDaily,
  MetaAdDaily,
  YouTubeVideo,
  YouTubeDaily,
  YouTubeChannelDaily,
  YouTubeFunnelCustomer,
  YouTubeTrafficSource,
  YouTubeSearchTerm,
} from "@/lib/data/analytics";

/* ───────── Re-export types for convenience ───────── */
export type {
  PageDailyRow,
  TrafficDaily,
  SearchQueryRow,
  SearchDailyRow,
  HourlyRow,
  AdsCampaignDaily,
  AdsKeywordDaily,
  AdsFunnelCustomer,
  MetaCampaignDaily,
  MetaAdsetDaily,
  MetaAdDaily,
  YouTubeVideo,
  YouTubeDaily,
  YouTubeChannelDaily,
  YouTubeFunnelCustomer,
  YouTubeTrafficSource,
  YouTubeSearchTerm,
};

/* ───────── Types ───────── */
export type MainTab = "seo" | "lp" | "ads" | "meta_ads" | "youtube" | "heatmap";
export type SeoSub = "pages" | "ctr" | "cannibalization" | "decay" | "keywords" | "hourly";
export type Period = "week" | "month";
export type Metric = "pageviews" | "sessions" | "users";
export type AdsGranularity = "daily" | "weekly" | "monthly";

export const METRIC_LABELS: Record<Metric, string> = { pageviews: "PV", sessions: "セッション", users: "ユーザー" };
export const SITE_BASE = "https://akagiconsulting.com";

/* Expected CTR by position (industry avg) */
export const EXPECTED_CTR: Record<number, number> = {
  1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.07,
  6: 0.05, 7: 0.04, 8: 0.03, 9: 0.03, 10: 0.025,
};
export function expectedCtr(pos: number): number {
  const rounded = Math.min(Math.max(Math.round(pos), 1), 10);
  return EXPECTED_CTR[rounded] || 0.02;
}

/* ───────── Props for the main container ───────── */
export interface AnalyticsProps {
  pageDailyRows: PageDailyRow[];
  traffic: TrafficDaily[];
  searchQueries: SearchQueryRow[];
  searchDailyRows: SearchDailyRow[];
  hourlyRows: HourlyRow[];
  adsCampaigns: AdsCampaignDaily[];
  adsKeywords: AdsKeywordDaily[];
  adsFunnel: AdsFunnelCustomer[];
  metaCampaigns: MetaCampaignDaily[];
  metaAdsets: MetaAdsetDaily[];
  metaAds: MetaAdDaily[];
  metaFunnel: AdsFunnelCustomer[];
  youtubeVideos: YouTubeVideo[];
  youtubeDaily: YouTubeDaily[];
  youtubeChannelDaily: YouTubeChannelDaily[];
  youtubeFunnel: YouTubeFunnelCustomer[];
  youtubeTrafficSources: YouTubeTrafficSource[];
  youtubeSearchTerms: YouTubeSearchTerm[];
  lastUpdated?: {
    ga: string | null;
    ads: string | null;
    meta: string | null;
    youtube: string | null;
  };
  adsSummary?: React.ReactNode;
  metaAdsSummary?: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adsWeeklyReports?: any[];
}

/* ───────── Shared Utils ───────── */
export function classifyLabel(segment: string): string {
  if (segment === "blog") return "ブログ";
  if (segment === "lp_main" || segment === "lp3") return "LP";
  return "その他";
}
export function classifyFromPath(p: string): string {
  if (p.startsWith("/blog/")) return "ブログ";
  if (p === "/" || p.startsWith("/lp") || p.startsWith("/corporate") || p.startsWith("/schedule")) return "LP";
  return "その他";
}

export function segmentBadge(label: string) {
  const c: Record<string, string> = {
    "ブログ": "bg-emerald-500/20 text-emerald-300",
    LP: "bg-blue-500/20 text-blue-300",
    "その他": "bg-gray-500/20 text-gray-400",
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c[label] || c["その他"]}`}>{label}</span>;
}

export function getWeekKey(d: string): string {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(dt);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}
export function getMonthKey(d: string): string { return d.slice(0, 7); }
export function periodLabel(key: string, period: Period): string {
  if (period === "week") return key.slice(5);
  const parts = key.split("-");
  return `${parts[0]}/${parts[1]}`;
}

export function heatmapBg(value: number, max: number): string {
  if (max === 0 || value === 0) return "";
  const r = value / max;
  if (r > 0.8) return "bg-indigo-500/50";
  if (r > 0.6) return "bg-indigo-500/35";
  if (r > 0.4) return "bg-indigo-500/25";
  if (r > 0.2) return "bg-indigo-500/15";
  return "bg-indigo-500/5";
}

export function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function trendArrow(current: number, previous: number) {
  if (previous === 0 && current === 0) return <span className="text-gray-600">—</span>;
  if (previous === 0) return <span className="text-green-400">↑new</span>;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return <span className="text-gray-500">→</span>;
  return pct > 0
    ? <span className="text-green-400">↑{pct.toFixed(0)}%</span>
    : <span className="text-red-400">↓{Math.abs(pct).toFixed(0)}%</span>;
}

export function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
      active ? "border-brand text-white bg-white/5" : "border-transparent text-gray-400 hover:text-white hover:bg-white/5"
    }`}>{label}</button>
  );
}

export function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
      active ? "bg-brand/20 text-brand border border-brand/30" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
    }`}>{label}</button>
  );
}

export function KpiCard({ title, value, sub }: { title: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="bg-surface-raised border border-white/10 rounded-xl p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{title}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
      <div className="mt-1">{sub}</div>
    </div>
  );
}

export function GranularitySelector({ granularity, setGranularity }: { granularity: AdsGranularity; setGranularity: (g: AdsGranularity) => void }) {
  return (
    <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
      {([["daily", "日別"], ["weekly", "週別"], ["monthly", "月別"]] as const).map(([v, label]) => (
        <button key={v} onClick={() => setGranularity(v)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${granularity === v ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>{label}</button>
      ))}
    </div>
  );
}

export function getDataDateRange(data: { date: string }[]): { min: string; max: string } {
  if (data.length === 0) return { min: "", max: "" };
  let min = data[0].date, max = data[0].date;
  for (const r of data) {
    if (r.date < min) min = r.date;
    if (r.date > max) max = r.date;
  }
  return { min, max };
}
