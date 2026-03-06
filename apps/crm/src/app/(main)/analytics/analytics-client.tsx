"use client";

import { useState } from "react";
import type {
  PageDaily,
  TrafficDaily,
  SearchDaily,
} from "@/lib/data/analytics";

type Tab = "blog" | "lp_main" | "lp3" | "search";

interface SummaryKPI {
  current: {
    pageviews: number;
    sessions: number;
    users: number;
    schedule_visits: number;
    lp_main_sessions: number;
    lp_main_cv: number;
    lp3_sessions: number;
    lp3_cv: number;
  };
  previous: {
    pageviews: number;
    sessions: number;
    users: number;
    schedule_visits: number;
  };
  dateRange: { from: string; to: string };
  prevDateRange: { from: string; to: string };
}

interface Props {
  summary: SummaryKPI;
  blogArticles: PageDaily[];
  trafficMain: TrafficDaily[];
  trafficLp3: TrafficDaily[];
  searchBlog: SearchDaily[];
  searchLp: SearchDaily[];
}

function change(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? "+∞" : "—";
  const pct = ((cur - prev) / prev) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function changeColor(cur: number, prev: number): string {
  if (prev === 0) return "";
  return cur >= prev ? "text-green-400" : "text-red-400";
}

function KpiCard({
  title,
  value,
  prev,
  suffix,
}: {
  title: string;
  value: number;
  prev?: number;
  suffix?: string;
}) {
  return (
    <div className="bg-surface-raised border border-white/10 rounded-xl p-5">
      <p className="text-xs text-gray-400 mb-1">{title}</p>
      <p className="text-2xl font-bold text-white">
        {value.toLocaleString()}
        {suffix && <span className="text-sm text-gray-400 ml-1">{suffix}</span>}
      </p>
      {prev !== undefined && (
        <p className={`text-xs mt-1 ${changeColor(value, prev)}`}>
          前週比 {change(value, prev)}
          <span className="text-gray-500 ml-1">({prev.toLocaleString()})</span>
        </p>
      )}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm rounded-lg transition-colors ${
        active
          ? "bg-brand text-white"
          : "text-gray-400 hover:text-white hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

function BlogTable({ articles }: { articles: PageDaily[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-gray-400 text-xs">
            <th className="text-left py-3 px-3 w-[40%]">記事タイトル</th>
            <th className="text-right py-3 px-3">PV</th>
            <th className="text-right py-3 px-3">セッション</th>
            <th className="text-right py-3 px-3">ユーザー</th>
            <th className="text-right py-3 px-3">滞在時間</th>
            <th className="text-right py-3 px-3">CV</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => (
            <tr
              key={a.page_path}
              className="border-b border-white/5 hover:bg-white/5 transition-colors"
            >
              <td className="py-3 px-3">
                <p className="text-white truncate max-w-md" title={a.page_title || ""}>
                  {a.page_title || a.page_path}
                </p>
                <p className="text-xs text-gray-500 truncate">{a.page_path}</p>
              </td>
              <td className="text-right py-3 px-3 text-white font-medium">
                {a.pageviews.toLocaleString()}
              </td>
              <td className="text-right py-3 px-3 text-gray-300">
                {a.sessions.toLocaleString()}
              </td>
              <td className="text-right py-3 px-3 text-gray-300">
                {a.users.toLocaleString()}
              </td>
              <td className="text-right py-3 px-3 text-gray-300">
                {a.avg_session_duration > 0
                  ? `${Math.round(a.avg_session_duration)}s`
                  : "—"}
              </td>
              <td className="text-right py-3 px-3">
                <span
                  className={
                    a.schedule_visits > 0
                      ? "text-green-400 font-medium"
                      : "text-gray-500"
                  }
                >
                  {a.schedule_visits}
                </span>
              </td>
            </tr>
          ))}
          {articles.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-gray-500">
                データがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TrafficTable({
  traffic,
  title,
}: {
  traffic: TrafficDaily[];
  title: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-300 mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400 text-xs">
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
            {traffic.map((t, i) => {
              const cvr = t.sessions > 0 ? (t.schedule_visits / t.sessions) * 100 : 0;
              return (
                <tr
                  key={i}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="py-3 px-3 text-white">{t.source || "(direct)"}</td>
                  <td className="py-3 px-3 text-gray-300">{t.medium || "(none)"}</td>
                  <td className="py-3 px-3 text-gray-300 truncate max-w-[200px]">
                    {t.campaign || "—"}
                  </td>
                  <td className="text-right py-3 px-3 text-white font-medium">
                    {t.sessions.toLocaleString()}
                  </td>
                  <td className="text-right py-3 px-3 text-gray-300">
                    {t.users.toLocaleString()}
                  </td>
                  <td className="text-right py-3 px-3">
                    <span
                      className={
                        t.schedule_visits > 0
                          ? "text-green-400 font-medium"
                          : "text-gray-500"
                      }
                    >
                      {t.schedule_visits}
                    </span>
                  </td>
                  <td className="text-right py-3 px-3">
                    <span
                      className={
                        cvr > 0 ? "text-green-400" : "text-gray-500"
                      }
                    >
                      {cvr > 0 ? `${cvr.toFixed(1)}%` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {traffic.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SearchTable({
  queries,
  title,
}: {
  queries: SearchDaily[];
  title: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-300 mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400 text-xs">
              <th className="text-left py-3 px-3">ページ</th>
              <th className="text-left py-3 px-3">検索クエリ</th>
              <th className="text-right py-3 px-3">クリック</th>
              <th className="text-right py-3 px-3">表示</th>
              <th className="text-right py-3 px-3">CTR</th>
              <th className="text-right py-3 px-3">順位</th>
            </tr>
          </thead>
          <tbody>
            {queries.map((q, i) => (
              <tr
                key={i}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                <td className="py-3 px-3 text-gray-300 truncate max-w-[250px]" title={q.page_path}>
                  {q.page_path}
                </td>
                <td className="py-3 px-3 text-white">{q.query}</td>
                <td className="text-right py-3 px-3 text-white font-medium">
                  {q.clicks}
                </td>
                <td className="text-right py-3 px-3 text-gray-300">
                  {q.impressions.toLocaleString()}
                </td>
                <td className="text-right py-3 px-3 text-gray-300">
                  {(q.ctr * 100).toFixed(1)}%
                </td>
                <td className="text-right py-3 px-3">
                  <span
                    className={
                      q.position <= 3
                        ? "text-green-400"
                        : q.position <= 10
                        ? "text-yellow-400"
                        : "text-gray-400"
                    }
                  >
                    {q.position.toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
            {queries.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AnalyticsClient({
  summary,
  blogArticles,
  trafficMain,
  trafficLp3,
  searchBlog,
  searchLp,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("blog");
  const { current: cur, previous: prev, dateRange } = summary;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">マーケティング分析</h1>
        <p className="text-sm text-gray-400 mt-1">
          {dateRange.from} 〜 {dateRange.to}（前週比）
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="総PV" value={cur.pageviews} prev={prev.pageviews} />
        <KpiCard title="総セッション" value={cur.sessions} prev={prev.sessions} />
        <KpiCard title="総ユーザー" value={cur.users} prev={prev.users} />
        <KpiCard
          title="CV（日程調整）"
          value={cur.schedule_visits}
          prev={prev.schedule_visits}
        />
      </div>

      {/* LP KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="メインLP セッション" value={cur.lp_main_sessions} />
        <KpiCard title="メインLP CV" value={cur.lp_main_cv} />
        <KpiCard title="YouTube LP セッション" value={cur.lp3_sessions} />
        <KpiCard title="YouTube LP CV" value={cur.lp3_cv} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <TabButton
          label="ブログ記事別"
          active={activeTab === "blog"}
          onClick={() => setActiveTab("blog")}
        />
        <TabButton
          label="メインLP流入"
          active={activeTab === "lp_main"}
          onClick={() => setActiveTab("lp_main")}
        />
        <TabButton
          label="YouTube LP流入"
          active={activeTab === "lp3"}
          onClick={() => setActiveTab("lp3")}
        />
        <TabButton
          label="検索クエリ"
          active={activeTab === "search"}
          onClick={() => setActiveTab("search")}
        />
      </div>

      {/* Tab Content */}
      <div className="bg-surface border border-white/10 rounded-xl p-5">
        {activeTab === "blog" && <BlogTable articles={blogArticles} />}

        {activeTab === "lp_main" && (
          <TrafficTable traffic={trafficMain} title="メインLP (/) 流入経路" />
        )}

        {activeTab === "lp3" && (
          <TrafficTable traffic={trafficLp3} title="YouTube LP (/lp3/) 流入経路" />
        )}

        {activeTab === "search" && (
          <div className="space-y-8">
            <SearchTable queries={searchLp} title="メインLP 検索クエリ" />
            <SearchTable queries={searchBlog} title="ブログ記事 検索クエリ" />
          </div>
        )}
      </div>
    </div>
  );
}
