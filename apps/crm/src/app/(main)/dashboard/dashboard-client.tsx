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

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  marketing: { label: "マーケティング", color: "border-blue-500/50 bg-blue-500/5", icon: "📊" },
  management: { label: "経営", color: "border-amber-500/50 bg-amber-500/5", icon: "📈" },
  sales: { label: "営業", color: "border-green-500/50 bg-green-500/5", icon: "🤝" },
};

interface DashboardClientProps {
  totalCustomers: number;
  closedCount: number;
  funnelMetrics: FunnelMetrics[];
  revenueMetrics: RevenueMetrics[];
  threeTierRevenue?: ThreeTierRevenue[];
  insights?: AiInsight[];
}

export function DashboardClient({
  totalCustomers,
  closedCount,
  funnelMetrics,
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
      // 生成結果をローカルステートに反映
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
          <FunnelChart data={funnelMetrics} />
        </div>
      </div>

      {/* AI経営示唆 */}
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">AI経営示唆</h2>
            {localInsights && localInsights.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                最終生成: {new Date(localInsights[0].generated_at).toLocaleString("ja-JP")}
              </p>
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

        {localInsights && localInsights.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {localInsights.map((insight) => {
              const meta = CATEGORY_LABELS[insight.category] || {
                label: insight.category,
                color: "border-gray-500/50 bg-gray-500/5",
                icon: "💡",
              };
              return (
                <div
                  key={insight.id}
                  className={`rounded-xl border-l-4 p-4 ${meta.color}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{meta.icon}</span>
                    <h3 className="text-sm font-semibold text-white">{meta.label}</h3>
                  </div>
                  <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {insight.content}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">AI示唆がまだ生成されていません</p>
            <p className="text-xs mt-1">「AI分析を実行」ボタンをクリックして生成してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
