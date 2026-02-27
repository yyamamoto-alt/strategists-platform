"use client";

import { mockProgressSheets } from "@/lib/mock-data";
import { ClipboardList, Star, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

function RatingBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-24">{label}</span>
      <div className="flex-1 bg-white/10 rounded-full h-2"><div className="bg-brand h-2 rounded-full transition-all" style={{ width: `${(value / 5) * 100}%` }} /></div>
      <span className="text-xs text-gray-300 w-6 text-right">{value}/5</span>
    </div>
  );
}

export default function ProgressSheetsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">プログレスシート</h1>
        <p className="text-sm text-gray-400 mt-1">メンターからの評価・フィードバック</p>
      </div>
      <div className="space-y-3">
        {mockProgressSheets.map((sheet) => {
          const isExpanded = expandedId === sheet.id;
          const avg = (sheet.understanding + sheet.effort + sheet.progress + sheet.communication + sheet.overall_rating) / 5;
          return (
            <div key={sheet.id} className="bg-surface-elevated rounded-xl overflow-hidden">
              <button onClick={() => setExpandedId(isExpanded ? null : sheet.id)} className="w-full p-4 text-left flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-center"><div className="text-lg font-bold text-white">#{sheet.session_number}</div><div className="text-xs text-gray-500">回目</div></div>
                  <div><div className="text-sm text-white">{sheet.session_date}</div><div className="flex items-center gap-1 mt-1"><Star className="w-3 h-3 text-yellow-400" /><span className="text-xs text-gray-400">平均 {avg.toFixed(1)}</span></div></div>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/10 pt-4 space-y-3">
                  <RatingBar label="理解度" value={sheet.understanding} />
                  <RatingBar label="努力" value={sheet.effort} />
                  <RatingBar label="進捗" value={sheet.progress} />
                  <RatingBar label="コミュニケーション" value={sheet.communication} />
                  <RatingBar label="総合" value={sheet.overall_rating} />
                  {sheet.feedback && <div className="mt-4"><h4 className="text-xs font-semibold text-gray-400 mb-1">フィードバック</h4><p className="text-sm text-gray-300">{sheet.feedback}</p></div>}
                  {sheet.strengths && <div><h4 className="text-xs font-semibold text-gray-400 mb-1">強み</h4><p className="text-sm text-green-300">{sheet.strengths}</p></div>}
                  {sheet.improvements && <div><h4 className="text-xs font-semibold text-gray-400 mb-1">改善点</h4><p className="text-sm text-orange-300">{sheet.improvements}</p></div>}
                  {sheet.next_goals && <div><h4 className="text-xs font-semibold text-gray-400 mb-1">次回の目標</h4><p className="text-sm text-brand-light">{sheet.next_goals}</p></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
