"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Assignment {
  id: string;
  customer_name: string | null;
  raw_data: Record<string, string>;
  applied_at: string;
}

// 表示する主要カラム（テーブル行に表示）
const mainColumns = [
  "タイムスタンプ",
  "問題タイプ",
  "解いた問題",
  "担当メンター",
  "思考時間",
  "施策仮説(結論)",
  "結論",
];

// テーブルには表示しないキー（メタデータ系）
const hiddenKeys = ["メールアドレス", "名前", "タイムスタンプ"];

export function AssignmentsClient({ assignments, isAdmin }: { assignments: Assignment[]; isAdmin?: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="p-5 bg-surface min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-white">課題提出</h1>
        <span className="text-xs text-gray-500">全 {assignments.length} 件</span>
      </div>

      {assignments.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>課題提出データはまだありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const d = a.raw_data;
            const isExpanded = expandedId === a.id;
            const problemType = d["問題タイプ"] || "";
            const problem = d["解いた問題"] || "";
            const timestamp = d["タイムスタンプ"] || "";
            const conclusion = d["施策仮説(結論)"] || d["結論"] || "";

            // 詳細表示用: メインカラム以外の全フィールド
            const detailKeys = Object.keys(d).filter(
              (key) => !mainColumns.includes(key) && !hiddenKeys.includes(key) && d[key]
            );

            return (
              <div key={a.id} className="bg-surface-elevated rounded-lg border border-white/10 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-500">{timestamp}</span>
                      {problemType && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-brand/20 text-brand-light">
                          {problemType}
                        </span>
                      )}
                      {d["担当メンター"] && (
                        <span className="text-xs text-gray-500">担当: {d["担当メンター"]}</span>
                      )}
                    </div>
                    <p className="text-sm text-white font-medium mb-1">{problem}</p>
                    {conclusion && (
                      <p className="text-xs text-gray-400 line-clamp-2">{conclusion}</p>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-500 shrink-0 mt-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500 shrink-0 mt-1" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-white/10 p-4 space-y-3">
                    {/* 主要カラム */}
                    {mainColumns.map((key) => {
                      const val = d[key];
                      if (!val || hiddenKeys.includes(key)) return null;
                      return (
                        <div key={key}>
                          <p className="text-xs font-semibold text-gray-400 mb-1">{key}</p>
                          <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{val}</p>
                        </div>
                      );
                    })}

                    {/* その他全フィールド */}
                    {detailKeys.map((key) => (
                      <div key={key}>
                        <p className="text-xs font-semibold text-gray-400 mb-1">{key}</p>
                        <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{d[key]}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
