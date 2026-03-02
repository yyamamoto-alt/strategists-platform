"use client";

import { useState } from "react";
import { FunnelChart } from "@/components/dashboard/funnel-chart";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import type {
  FunnelMetrics,
  RevenueMetrics,
  ThreeTierRevenue,
  AiInsight,
} from "@strategy-school/shared-db";

const CATEGORY_META: Record<string, { label: string; accent: string; bg: string }> = {
  marketing: { label: "マーケティング", accent: "border-blue-500", bg: "bg-blue-500/5" },
  sales: { label: "営業", accent: "border-emerald-500", bg: "bg-emerald-500/5" },
};

/** AI示唆テキストを ■ 単位でパース */
function parseInsightItems(content: string): { title: string; body: string }[] {
  return content
    .split("■")
    .filter((s) => s.trim().length > 0)
    .map((s) => {
      const trimmed = s.trim();
      // 太字タイトル（**...**）を抽出
      const boldMatch = trimmed.match(/^\*\*(.+?)\*\*[：:\s]*([\s\S]*)/);
      if (boldMatch) {
        return { title: boldMatch[1].trim(), body: boldMatch[2].trim() };
      }
      // 最初の行をタイトルとして使用
      const lines = trimmed.split("\n");
      return { title: lines[0].trim(), body: lines.slice(1).join("\n").trim() };
    });
}

interface DashboardClientProps {
  totalCustomers: number;
  closedCount: number;
  funnelMetrics: FunnelMetrics[];
  funnelKisotsu?: FunnelMetrics[];
  funnelShinsotsu?: FunnelMetrics[];
  revenueMetrics: RevenueMetrics[];
  threeTierRevenue?: ThreeTierRevenue[];
  insights?: AiInsight[];
}

export function DashboardClient({
  totalCustomers,
  closedCount,
  funnelMetrics,
  funnelKisotsu,
  funnelShinsotsu,
  revenueMetrics,
  threeTierRevenue,
  insights,
}: DashboardClientProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [localInsights, setLocalInsights] = useState<AiInsight[] | undefined>(insights);

  const handleGenerateInsights = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const res = await fetch("/api/insights/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setGenerationError(data.error || "生成に失敗しました");
        return;
      }
      const newInsights: AiInsight[] = data.insights.map(
        (i: { category: string; content: string }) => ({
          id: crypto.randomUUID(),
          category: i.category,
          content: i.content,
          data_snapshot: null,
          generated_at: data.generated_at,
        })
      );
      setLocalInsights(newInsights);
    } catch {
      setGenerationError("ネットワークエラーが発生しました");
    } finally {
      setIsGenerating(false);
    }
  };

  // management カテゴリをフィルタ
  const displayInsights = localInsights?.filter(
    (i) => i.category === "marketing" || i.category === "sales"
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCustomers}顧客 / 成約 {closedCount}件
          </p>
        </div>
        <div className="text-sm text-gray-500">
          最終更新: {new Date().toLocaleDateString("ja-JP")}
        </div>
      </div>

      {/* 売上推移 + ファネル推移 横並び */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">売上推移</h2>
          <RevenueChart data={revenueMetrics} threeTierData={threeTierRevenue} />
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">ファネル推移</h2>
          <FunnelChart
            data={funnelMetrics}
            kisotsuData={funnelKisotsu}
            shinsotsuData={funnelShinsotsu}
          />
        </div>
      </div>

      {/* AI経営示唆 */}
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">AI経営示唆</h2>
            {displayInsights && displayInsights.length > 0 && (
              <span className="text-xs text-gray-500">
                {new Date(displayInsights[0].generated_at).toLocaleString("ja-JP")}
              </span>
            )}
          </div>
          <button
            onClick={handleGenerateInsights}
            disabled={isGenerating}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-brand/20 text-brand hover:bg-brand/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? "生成中..." : "AI分析を実行"}
          </button>
        </div>

        {generationError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {generationError}
          </div>
        )}

        {displayInsights && displayInsights.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {displayInsights.map((insight) => {
              const meta = CATEGORY_META[insight.category] || {
                label: insight.category,
                accent: "border-gray-500",
                bg: "bg-gray-500/5",
              };
              const items = parseInsightItems(insight.content);
              return (
                <div
                  key={insight.id}
                  className={`rounded-xl border-t-2 ${meta.accent} ${meta.bg} p-4`}
                >
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    {meta.label}
                  </h3>
                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div key={idx}>
                        <p className="text-sm font-semibold text-white">
                          {item.title}
                        </p>
                        {item.body && (
                          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                            {item.body}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-500">
            <p className="text-sm">「AI分析を実行」で示唆を生成</p>
          </div>
        )}
      </div>
    </div>
  );
}
