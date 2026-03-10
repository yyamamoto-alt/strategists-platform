"use client";

import { useState } from "react";
import type { AiInsight } from "@strategy-school/shared-db";

const CATEGORY_META: Record<string, { label: string; accent: string; icon: string }> = {
  revenue: { label: "売上", accent: "border-l-blue-500", icon: "chart-bar" },
  funnel: { label: "ファネル", accent: "border-l-emerald-500", icon: "funnel" },
  channel: { label: "チャネル", accent: "border-l-amber-500", icon: "megaphone" },
  marketing: { label: "マーケティング", accent: "border-l-blue-500", icon: "chart-bar" },
  sales: { label: "営業", accent: "border-l-emerald-500", icon: "funnel" },
};

function parseInsightItems(content: string): { title: string; body: string }[] {
  return content
    .split("■")
    .filter((s) => s.trim().length > 0)
    .map((s) => {
      const trimmed = s.trim();
      const boldMatch = trimmed.match(/^\*\*(.+?)\*\*[：:\s]*([\s\S]*)/);
      if (boldMatch) {
        return { title: boldMatch[1].trim(), body: boldMatch[2].trim() };
      }
      const lines = trimmed.split("\n");
      return { title: lines[0].trim(), body: lines.slice(1).join("\n").trim() };
    });
}

interface InsightsClientProps {
  insights?: AiInsight[];
}

export function InsightsClient({ insights }: InsightsClientProps) {
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

  const displayInsights = localInsights?.filter(
    (i) => CATEGORY_META[i.category]
  );

  return (
    <div className="px-6 pb-6">
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">AI経営分析</h2>
            {displayInsights && displayInsights.length > 0 && (
              <span className="text-xs text-gray-500">
                {new Date(displayInsights[0].generated_at).toLocaleString("ja-JP")}
              </span>
            )}
            <span className="text-[10px] text-gray-600">直近2〜3ヶ月の売上・ファネル・チャネルを横断分析</span>
          </div>
          <button
            onClick={handleGenerateInsights}
            disabled={isGenerating}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-brand/20 text-brand hover:bg-brand/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? "分析中..." : "AI分析を実行"}
          </button>
        </div>

        {generationError && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {generationError}
          </div>
        )}

        {displayInsights && displayInsights.length > 0 ? (
          <div className="space-y-3">
            {displayInsights.map((insight) => {
              const meta = CATEGORY_META[insight.category] || {
                label: insight.category,
                accent: "border-l-gray-500",
              };
              const items = parseInsightItems(insight.content);
              return (
                <div
                  key={insight.id}
                  className={`border-l-2 ${meta.accent} bg-white/[0.02] rounded-r-lg px-4 py-3`}
                >
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                    {meta.label}
                  </h3>
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div key={idx}>
                        <p className="text-sm font-semibold text-white">
                          {item.title}
                        </p>
                        {item.body && (
                          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed whitespace-pre-line">
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
            <p className="text-sm">「AI分析を実行」で売上・ファネル・チャネルの横断分析を生成</p>
          </div>
        )}
      </div>
    </div>
  );
}
