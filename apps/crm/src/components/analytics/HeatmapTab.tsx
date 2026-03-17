"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { KpiCard, SubTab } from "./shared";

type DeviceType = "pc" | "sp";
type ClickPoint = { x: number; y: number; count: number };
type ScrollDepth = { depth: number; sessions: number; rate: number };

const PAGES = [
  { value: "/", label: "メインLP" },
  { value: "/lp3/", label: "面談申込LP" },
];
const DAYS_OPTIONS = [
  { value: 7, label: "7日" },
  { value: 30, label: "30日" },
  { value: 90, label: "90日" },
];

type VersionInfo = { version: string; count: number; first: string; last: string };

export function HeatmapTab() {
  const [page, setPage] = useState("/");
  const [device, setDevice] = useState<DeviceType>("pc");
  const [days, setDays] = useState(30);
  const [view, setView] = useState<"clicks" | "scroll">("clicks");
  const [version, setVersion] = useState<string>(""); // "" = all versions
  const [versions, setVersions] = useState<VersionInfo[]>([]);

  const [clicks, setClicks] = useState<ClickPoint[]>([]);
  const [totalClicks, setTotalClicks] = useState(0);
  const [maxCount, setMaxCount] = useState(0);
  const [depths, setDepths] = useState<ScrollDepth[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loading, setLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // バージョン一覧取得
  useEffect(() => {
    fetch(`/api/heatmap/data?page_path=${encodeURIComponent(page)}&days=${days}&type=versions`)
      .then(r => r.json())
      .then(json => {
        setVersions(json.versions || []);
        // デフォルトで最新バージョンを選択
        if (json.versions?.length > 0 && !version) {
          setVersion(json.versions[0].version);
        }
      })
      .catch(() => {});
  }, [page, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const vParam = version ? `&version=${encodeURIComponent(version)}` : "";
      if (view === "clicks") {
        const res = await fetch(`/api/heatmap/data?page_path=${encodeURIComponent(page)}&device=${device}&days=${days}&type=clicks${vParam}`);
        const json = await res.json();
        setClicks(json.clicks || []);
        setTotalClicks(json.total || 0);
        setMaxCount(json.maxCount || 0);
      } else {
        const res = await fetch(`/api/heatmap/data?page_path=${encodeURIComponent(page)}&device=${device}&days=${days}&type=scroll${vParam}`);
        const json = await res.json();
        setDepths(json.depths || []);
        setTotalSessions(json.totalSessions || 0);
      }
    } catch (e) {
      console.error("heatmap fetch error", e);
    }
    setLoading(false);
  }, [page, device, days, view, version]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Canvas heatmap drawing
  useEffect(() => {
    if (view !== "clicks" || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    if (clicks.length === 0 || maxCount === 0) return;

    // Draw each click point as a radial gradient
    for (const pt of clicks) {
      const cx = (pt.x / 100) * w;
      const cy = (pt.y / 100) * h;
      const intensity = pt.count / maxCount;
      const radius = 16 + intensity * 24;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      const alpha = Math.min(0.6, 0.1 + intensity * 0.5);
      // Blue → Green → Yellow → Red
      if (intensity < 0.33) {
        grad.addColorStop(0, `rgba(59,130,246,${alpha})`);
        grad.addColorStop(1, `rgba(59,130,246,0)`);
      } else if (intensity < 0.66) {
        grad.addColorStop(0, `rgba(234,179,8,${alpha})`);
        grad.addColorStop(1, `rgba(234,179,8,0)`);
      } else {
        grad.addColorStop(0, `rgba(239,68,68,${alpha})`);
        grad.addColorStop(1, `rgba(239,68,68,0)`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
  }, [clicks, maxCount, view]);

  const avgScrollDepth = depths.length > 0
    ? depths.reduce((sum, d) => sum + (d.depth * d.sessions), 0) / Math.max(totalSessions, 1)
    : 0;
  const fiftyPctRate = depths.find(d => d.depth === 50)?.rate ?? 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {PAGES.map(p => (
            <button key={p.value} onClick={() => setPage(p.value)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${page === p.value ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          <button onClick={() => setDevice("pc")}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${device === "pc" ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>PC</button>
          <button onClick={() => setDevice("sp")}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${device === "sp" ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>SP</button>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {DAYS_OPTIONS.map(d => (
            <button key={d.value} onClick={() => setDays(d.value)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${days === d.value ? "bg-brand text-white" : "text-gray-400 hover:text-white"}`}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <SubTab label="クリック" active={view === "clicks"} onClick={() => setView("clicks")} />
          <SubTab label="スクロール" active={view === "scroll"} onClick={() => setView("scroll")} />
        </div>
        {versions.length > 0 && (
          <select
            value={version}
            onChange={e => setVersion(e.target.value)}
            className="bg-white/5 border border-white/10 text-xs text-gray-300 rounded-lg px-3 py-1.5"
          >
            <option value="">全バージョン</option>
            {versions.map(v => (
              <option key={v.version} value={v.version}>
                v:{v.version.slice(0, 6)} ({v.count}件, 〜{v.last.slice(0, 10)})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {view === "clicks" ? (
          <>
            <KpiCard title="総クリック数" value={totalClicks.toLocaleString()} sub={<span className="text-xs text-gray-500">直近{days}日</span>} />
            <KpiCard title="クリック集中ポイント" value={clicks.length.toLocaleString()} sub={<span className="text-xs text-gray-500">2%グリッドセル</span>} />
            <KpiCard title="最大クリック密度" value={maxCount.toLocaleString()} sub={<span className="text-xs text-gray-500">1セルあたり</span>} />
          </>
        ) : (
          <>
            <KpiCard title="計測セッション数" value={totalSessions.toLocaleString()} sub={<span className="text-xs text-gray-500">直近{days}日</span>} />
            <KpiCard title="平均スクロール深度" value={`${Math.round(avgScrollDepth)}%`} sub={<span className="text-xs text-gray-500">全セッション平均</span>} />
            <KpiCard title="50%到達率" value={`${fiftyPctRate}%`} sub={<span className="text-xs text-gray-500">ページ半分まで閲覧</span>} />
          </>
        )}
      </div>

      {loading && <div className="text-center py-12 text-gray-500">読み込み中...</div>}

      {/* Click Heatmap */}
      {view === "clicks" && !loading && (
        <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-white/10">
            <p className="text-sm text-gray-400">クリックヒートマップ</p>
            {clicks.length === 0 && <p className="text-xs text-gray-600 mt-1">データがありません。トラッキング開始後にデータが蓄積されます。</p>}
          </div>
          <div ref={containerRef} className="relative" style={{
            width: device === "sp" ? 390 : "100%",
            height: device === "sp" ? 12000 : 10000,
            margin: device === "sp" ? "0 auto" : undefined,
          }}>
            <iframe
              src={`https://akagiconsulting.com${page}`}
              title="LP Preview"
              className="border-0"
              style={{
                width: device === "sp" ? 390 : "100%",
                height: device === "sp" ? 12000 : 10000,
                pointerEvents: "none",
                transformOrigin: "top left",
              }}
              sandbox="allow-same-origin allow-scripts"
            />
            <canvas ref={canvasRef} className="absolute inset-0" style={{ pointerEvents: "none" }} />
            {clicks.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-gray-300 text-sm">
                データ蓄積中...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scroll Depth Chart */}
      {view === "scroll" && !loading && (
        <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-white/10">
            <p className="text-sm text-gray-400">スクロール到達率</p>
          </div>
          <div className="p-4 space-y-1">
            {depths.length === 0 && <p className="text-xs text-gray-600">データがありません。</p>}
            {depths.map(d => (
              <div key={d.depth} className="flex items-center gap-2 text-xs">
                <span className="w-10 text-right text-gray-500 tabular-nums">{d.depth}%</span>
                <div className="flex-1 bg-white/5 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${d.rate}%`,
                      background: d.depth <= 25 ? "#3b82f6" : d.depth <= 50 ? "#10b981" : d.depth <= 75 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <span className="w-16 text-gray-400 tabular-nums">{d.rate}% <span className="text-gray-600">({d.sessions})</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
