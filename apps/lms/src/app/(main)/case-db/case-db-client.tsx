"use client";

import { useState, useMemo } from "react";

interface CaseProblem {
  id: string;
  company: string;
  no: number;
  tags: string[];
  question: string;
  is_public: boolean;
}

interface Props {
  problems: CaseProblem[];
}

const COMPANIES = [
  "BCG", "Bain", "McKinsey", "Strategy&", "A.T. Kearney",
  "Roland Berger", "Arthur D. Little", "Dream Incubator",
  "アクセンチュア", "B&DX", "FM", "KPMG",
];

const TAG_TYPES = [
  "フェルミ", "売上向上", "利益", "全社戦略", "公共",
  "網羅構造", "論点", "発展系", "抽象",
];

const TAG_COLORS: Record<string, string> = {
  "フェルミ": "bg-red-900/40 text-red-300 border-red-800/50",
  "売上向上": "bg-blue-900/40 text-blue-300 border-blue-800/50",
  "利益": "bg-green-900/40 text-green-300 border-green-800/50",
  "全社戦略": "bg-purple-900/40 text-purple-300 border-purple-800/50",
  "公共": "bg-amber-900/40 text-amber-300 border-amber-800/50",
  "網羅構造": "bg-cyan-900/40 text-cyan-300 border-cyan-800/50",
  "論点": "bg-orange-900/40 text-orange-300 border-orange-800/50",
  "発展系": "bg-pink-900/40 text-pink-300 border-pink-800/50",
  "抽象": "bg-slate-700/40 text-slate-300 border-slate-600/50",
};

export function CaseDbClient({ problems }: Props) {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = problems;
    if (selectedCompany) result = result.filter((p) => p.company === selectedCompany);
    if (selectedTag) result = result.filter((p) => p.tags.includes(selectedTag));
    return result;
  }, [problems, selectedCompany, selectedTag]);

  // Group by company
  const grouped = useMemo(() => {
    const map = new Map<string, CaseProblem[]>();
    for (const p of filtered) {
      if (!map.has(p.company)) map.set(p.company, []);
      map.get(p.company)!.push(p);
    }
    const sorted = new Map<string, CaseProblem[]>();
    for (const c of COMPANIES) {
      if (map.has(c)) sorted.set(c, map.get(c)!);
    }
    return sorted;
  }, [filtered]);

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">過去問データベース</h1>
          <p className="text-gray-400 text-sm">
            戦略コンサルティングファームのケース面接過去問を企業別・タイプ別に検索
          </p>
        </div>

        {/* Company filter tabs */}
        <div className="mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">企業で絞り込む</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCompany(null)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                !selectedCompany
                  ? "bg-brand text-white border-brand"
                  : "bg-transparent text-gray-400 border-white/10 hover:border-white/20 hover:text-white"
              }`}
            >
              ALL
            </button>
            {COMPANIES.map((c) => {
              const count = problems.filter((p) => p.company === c).length;
              return (
                <button
                  key={c}
                  onClick={() => setSelectedCompany(selectedCompany === c ? null : c)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    selectedCompany === c
                      ? "bg-brand text-white border-brand"
                      : "bg-transparent text-gray-400 border-white/10 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {c}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tag filter */}
        <div className="mb-8">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">問題タイプ</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                !selectedTag
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-transparent text-gray-400 border-white/10 hover:text-white"
              }`}
            >
              すべて
            </button>
            {TAG_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTag(selectedTag === t ? null : t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                  selectedTag === t
                    ? TAG_COLORS[t] || "bg-white/10 text-white border-white/20"
                    : "bg-transparent text-gray-400 border-white/10 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="text-sm text-gray-500 mb-4">{filtered.length} 件の問題</p>

        {/* Problem tables grouped by company */}
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([company, companyProblems]) => (
            <div key={company}>
              <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                {company}
                <span className="text-xs text-gray-500 font-normal">{companyProblems.length}問</span>
              </h2>
              <div className="bg-surface-elevated rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03]">
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 w-12">No</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 w-40">問題タイプ</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500">問題文</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companyProblems.sort((a, b) => a.no - b.no).map((p, i) => (
                      <tr
                        key={p.id}
                        className={`border-b border-white/[0.06] last:border-0 hover:bg-[rgba(200,16,46,0.04)] transition-colors ${
                          i % 2 === 1 ? "bg-white/[0.015]" : ""
                        }`}
                      >
                        <td className="py-2.5 px-4 text-sm text-gray-500 align-top">{p.no}</td>
                        <td className="py-2.5 px-4 align-top">
                          <div className="flex flex-wrap gap-1">
                            {p.tags.map((tag) => (
                              <span
                                key={tag}
                                className={`text-[10px] px-1.5 py-0.5 rounded border ${TAG_COLORS[tag] || "bg-white/10 text-gray-300 border-white/10"}`}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-sm text-gray-200 leading-relaxed">{p.question}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            該当する問題がありません
          </div>
        )}
      </div>
    </div>
  );
}
