"use client";

import { useState, useEffect, useCallback } from "react";

interface MetaAd {
  id: string;
  page_name: string;
  page_id: string;
  bodies: string[];
  link_titles: string[];
  link_captions: string[];
  start_date: string | null;
  stop_date: string | null;
  creation_time: string | null;
  platforms: string[];
  estimated_audience: { lower_bound?: number; upper_bound?: number } | null;
}

interface CompetitorSite {
  id: string;
  name: string;
  url: string;
  check_frequency: string;
  is_active: boolean;
  last_checked_at: string | null;
  created_at: string;
}

interface CompetitorAlert {
  id: string;
  site_id: string;
  change_type: string;
  change_summary: string;
  details: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  competitor_sites: { name: string; url: string } | null;
}

const CHANGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  price_change: { label: "料金変更", color: "bg-red-500/20 text-red-400" },
  new_service: { label: "新サービス", color: "bg-purple-500/20 text-purple-400" },
  design_change: { label: "デザイン変更", color: "bg-blue-500/20 text-blue-400" },
  content_change: { label: "コンテンツ更新", color: "bg-yellow-500/20 text-yellow-400" },
  minor_update: { label: "軽微な更新", color: "bg-gray-500/20 text-gray-400" },
};

export default function CompetitorsClient() {
  const [sites, setSites] = useState<CompetitorSite[]>([]);
  const [alerts, setAlerts] = useState<CompetitorAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"alerts" | "sites" | "meta-ads">("alerts");

  // 新規サイト追加フォーム
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  // Meta Ads
  const [metaQuery, setMetaQuery] = useState("");
  const [metaAds, setMetaAds] = useState<MetaAd[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [sitesRes, alertsRes] = await Promise.all([
        fetch("/api/competitors"),
        fetch("/api/competitors/alerts?limit=100"),
      ]);
      const sitesData = await sitesRes.json();
      const alertsData = await alertsRes.json();
      setSites(sitesData.sites || []);
      setUnreadCount(sitesData.unreadCount || 0);
      setAlerts(alertsData.alerts || []);
    } catch (e) {
      console.error("Failed to fetch competitor data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;

    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, url: newUrl }),
      });
      if (res.ok) {
        setNewName("");
        setNewUrl("");
        setShowAddForm(false);
        fetchData();
      }
    } catch (e) {
      console.error("Failed to add site:", e);
    }
  };

  const handleDeleteSite = async (id: string) => {
    if (!confirm("このサイトを削除しますか？関連するスナップショットとアラートも削除されます。")) return;
    try {
      await fetch(`/api/competitors?id=${id}`, { method: "DELETE" });
      fetchData();
    } catch (e) {
      console.error("Failed to delete site:", e);
    }
  };

  const handleToggleActive = async (site: CompetitorSite) => {
    try {
      await fetch("/api/competitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: site.id, is_active: !site.is_active }),
      });
      fetchData();
    } catch (e) {
      console.error("Failed to toggle site:", e);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/competitors/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      });
      fetchData();
    } catch (e) {
      console.error("Failed to mark all read:", e);
    }
  };

  const handleSearchMetaAds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaQuery.trim()) return;
    setMetaLoading(true);
    setMetaError("");
    try {
      const res = await fetch(`/api/competitors/meta-ads?query=${encodeURIComponent(metaQuery)}`);
      const data = await res.json();
      if (data.error) {
        setMetaError(data.error);
        setMetaAds([]);
      } else {
        setMetaAds(data.ads || []);
      }
    } catch {
      setMetaError("検索に失敗しました");
    } finally {
      setMetaLoading(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await fetch("/api/competitors/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      fetchData();
    } catch (e) {
      console.error("Failed to mark read:", e);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-48" />
          <div className="h-64 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">競合分析</h1>
          <p className="text-sm text-gray-400 mt-1">
            {sites.length}サイト監視中
            {unreadCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                {unreadCount}件の未読アラート
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-brand text-white text-sm rounded-lg hover:bg-brand/80 transition-colors"
        >
          + サイト追加
        </button>
      </div>

      {/* サイト追加フォーム */}
      {showAddForm && (
        <form onSubmit={handleAddSite} className="bg-surface-raised border border-white/10 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">競合名</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例: LEAP"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">URL</label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-1.5 bg-brand text-white text-sm rounded-lg hover:bg-brand/80">
              追加
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-1.5 bg-white/5 text-gray-300 text-sm rounded-lg hover:bg-white/10"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}

      {/* タブ */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setTab("alerts")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "alerts"
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          アラート
          {unreadCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("sites")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "sites"
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          監視サイト ({sites.length})
        </button>
        <button
          onClick={() => setTab("meta-ads")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "meta-ads"
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Meta広告
        </button>
      </div>

      {/* アラート一覧 */}
      {tab === "alerts" && (
        <div className="space-y-3">
          {unreadCount > 0 && (
            <div className="flex justify-end">
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                すべて既読にする
              </button>
            </div>
          )}

          {alerts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">アラートはまだありません</p>
              <p className="text-sm">サイトを追加すると、変更が検知された際にここに表示されます</p>
            </div>
          ) : (
            alerts.map((alert) => {
              const typeInfo = CHANGE_TYPE_LABELS[alert.change_type] || {
                label: alert.change_type,
                color: "bg-gray-500/20 text-gray-400",
              };

              return (
                <div
                  key={alert.id}
                  className={`bg-surface-raised border rounded-lg p-4 transition-colors ${
                    alert.is_read ? "border-white/5" : "border-brand/30 bg-brand/5"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {!alert.is_read && (
                          <span className="w-2 h-2 bg-brand rounded-full" />
                        )}
                        <span className="text-sm font-medium text-white">
                          {alert.competitor_sites?.name || "不明"}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(alert.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{alert.change_summary}</p>
                      {alert.competitor_sites?.url && (
                        <a
                          href={alert.competitor_sites.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand hover:underline mt-1 inline-block"
                        >
                          サイトを確認 →
                        </a>
                      )}
                    </div>
                    {!alert.is_read && (
                      <button
                        onClick={() => handleMarkRead(alert.id)}
                        className="text-xs text-gray-500 hover:text-white ml-4"
                      >
                        既読
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* サイト一覧 */}
      {tab === "sites" && (
        <div className="space-y-3">
          {sites.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">監視サイトが登録されていません</p>
              <p className="text-sm">「+ サイト追加」ボタンから競合サイトを登録してください</p>
            </div>
          ) : (
            sites.map((site) => (
              <div
                key={site.id}
                className="bg-surface-raised border border-white/10 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${site.is_active ? "bg-green-400" : "bg-gray-600"}`} />
                      <span className="text-sm font-medium text-white">{site.name}</span>
                    </div>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-brand mt-0.5 inline-block"
                    >
                      {site.url}
                    </a>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">
                        頻度: {site.check_frequency === "daily" ? "毎日" : "毎週"}
                      </span>
                      {site.last_checked_at && (
                        <span className="text-xs text-gray-500">
                          最終チェック: {new Date(site.last_checked_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(site)}
                      className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                        site.is_active
                          ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                          : "bg-gray-500/20 text-gray-400 hover:bg-gray-500/30"
                      }`}
                    >
                      {site.is_active ? "有効" : "無効"}
                    </button>
                    <button
                      onClick={() => handleDeleteSite(site.id)}
                      className="px-3 py-1 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Meta広告 */}
      {tab === "meta-ads" && (
        <div className="space-y-4">
          <form onSubmit={handleSearchMetaAds} className="flex gap-3">
            <input
              type="text"
              value={metaQuery}
              onChange={(e) => setMetaQuery(e.target.value)}
              placeholder="キーワードで競合の広告を検索（例: ケース面接、コンサル転職）"
              className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <button
              type="submit"
              disabled={metaLoading}
              className="px-6 py-2 bg-brand text-white text-sm rounded-lg hover:bg-brand/80 transition-colors disabled:opacity-50"
            >
              {metaLoading ? "検索中..." : "検索"}
            </button>
          </form>

          {/* プリセット検索 */}
          <div className="flex gap-2 flex-wrap">
            {["ケース面接", "コンサル転職", "戦略コンサル", "MBB", "コンサル対策"].map((keyword) => (
              <button
                key={keyword}
                onClick={() => {
                  setMetaQuery(keyword);
                  setMetaLoading(true);
                  setMetaError("");
                  fetch(`/api/competitors/meta-ads?query=${encodeURIComponent(keyword)}`)
                    .then((r) => r.json())
                    .then((data) => {
                      if (data.error) {
                        setMetaError(data.error);
                        setMetaAds([]);
                      } else {
                        setMetaAds(data.ads || []);
                      }
                    })
                    .catch(() => setMetaError("検索に失敗しました"))
                    .finally(() => setMetaLoading(false));
                }}
                className="px-3 py-1 text-xs bg-white/5 text-gray-300 rounded-full hover:bg-white/10 transition-colors"
              >
                {keyword}
              </button>
            ))}
          </div>

          {metaError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
              {metaError}
            </div>
          )}

          {metaAds.length > 0 && (
            <p className="text-sm text-gray-400">{metaAds.length}件の広告が見つかりました</p>
          )}

          <div className="space-y-3">
            {metaAds.map((ad) => (
              <div
                key={ad.id}
                className="bg-surface-raised border border-white/10 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-sm font-medium text-white">{ad.page_name}</span>
                    {ad.platforms.length > 0 && (
                      <span className="ml-2 text-xs text-gray-500">
                        {ad.platforms.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {ad.start_date && (
                      <span>
                        {new Date(ad.start_date).toLocaleDateString("ja-JP")}
                        {ad.stop_date
                          ? ` 〜 ${new Date(ad.stop_date).toLocaleDateString("ja-JP")}`
                          : " 〜 配信中"}
                      </span>
                    )}
                  </div>
                </div>

                {ad.link_titles.length > 0 && (
                  <p className="text-sm font-medium text-blue-400 mb-1">
                    {ad.link_titles[0]}
                  </p>
                )}

                {ad.bodies.length > 0 && (
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">
                    {ad.bodies[0].length > 300
                      ? ad.bodies[0].substring(0, 300) + "..."
                      : ad.bodies[0]}
                  </p>
                )}

                {ad.link_captions.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{ad.link_captions[0]}</p>
                )}

                {ad.estimated_audience && (
                  <p className="text-xs text-gray-500 mt-2">
                    推定リーチ: {ad.estimated_audience.lower_bound?.toLocaleString()}
                    {ad.estimated_audience.upper_bound
                      ? ` 〜 ${ad.estimated_audience.upper_bound.toLocaleString()}`
                      : "+"}
                  </p>
                )}
              </div>
            ))}
          </div>

          {metaAds.length === 0 && !metaLoading && !metaError && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">Meta広告を検索</p>
              <p className="text-sm">キーワードを入力するか、プリセットボタンをクリックして競合の広告を検索できます</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
