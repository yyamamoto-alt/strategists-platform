"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";

interface CaseProblem {
  id: string;
  company: string;
  problem_text: string;
  category: string | null;
  difficulty: string | null;
  hint: string | null;
  solution_outline: string | null;
  is_public: boolean;
}

const difficultyColors: Record<string, string> = {
  "初級": "bg-green-900/50 text-green-300",
  "中級": "bg-yellow-900/50 text-yellow-300",
  "上級": "bg-red-900/50 text-red-300",
};

export function CaseDbClient({
  problems,
  categories,
}: {
  problems: CaseProblem[];
  categories: string[];
}) {
  const [companyFilter, setCompanyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return problems.filter((p) => {
      if (companyFilter && !p.company.toLowerCase().includes(companyFilter.toLowerCase())) {
        return false;
      }
      if (categoryFilter && p.category !== categoryFilter) {
        return false;
      }
      if (difficultyFilter && p.difficulty !== difficultyFilter) {
        return false;
      }
      if (keyword) {
        const q = keyword.toLowerCase();
        const matchesCompany = p.company.toLowerCase().includes(q);
        const matchesText = p.problem_text.toLowerCase().includes(q);
        const matchesHint = p.hint?.toLowerCase().includes(q);
        const matchesSolution = p.solution_outline?.toLowerCase().includes(q);
        if (!matchesCompany && !matchesText && !matchesHint && !matchesSolution) {
          return false;
        }
      }
      return true;
    });
  }, [problems, companyFilter, categoryFilter, difficultyFilter, keyword]);

  return (
    <div className="p-6 bg-surface min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">ケース面接データベース</h1>
        <p className="text-sm text-gray-400 mt-1">
          企業別のケース面接問題を検索・閲覧できます。ヒントや解答の方針も確認可能です。
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="キーワード検索..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-9 pr-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand"
          />
        </div>
        <input
          type="text"
          placeholder="企業名で絞り込み"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-brand"
        >
          <option value="">全カテゴリ</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
          className="px-3 py-2 bg-surface-elevated border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-brand"
        >
          <option value="">全難易度</option>
          <option value="初級">初級</option>
          <option value="中級">中級</option>
          <option value="上級">上級</option>
        </select>
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-500 mb-4">
        {filtered.length} 件の問題
      </p>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          条件に一致する問題が見つかりません
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => {
            const isExpanded = expandedId === p.id;
            return (
              <div
                key={p.id}
                className="bg-surface-elevated rounded-xl border border-white/10 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white font-semibold text-sm truncate">
                          {p.company}
                        </span>
                        {p.category && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300 whitespace-nowrap">
                            {p.category}
                          </span>
                        )}
                        {p.difficulty && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${difficultyColors[p.difficulty] || "bg-gray-700 text-gray-300"}`}
                          >
                            {p.difficulty}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-300 line-clamp-2">
                        {p.problem_text}
                      </p>
                    </div>
                    <div className="flex-shrink-0 mt-1">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400 transition-transform" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400 transition-transform" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                        問題文
                      </h4>
                      <p className="text-sm text-gray-200 whitespace-pre-wrap">
                        {p.problem_text}
                      </p>
                    </div>
                    {p.hint && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                          ヒント
                        </h4>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">
                          {p.hint}
                        </p>
                      </div>
                    )}
                    {p.solution_outline && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                          解答の方針
                        </h4>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">
                          {p.solution_outline}
                        </p>
                      </div>
                    )}
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
