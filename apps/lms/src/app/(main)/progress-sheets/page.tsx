"use client";

import { mockProgressSheets } from "@/lib/mock-data";

// レベル階層: 初級者 < 中級者 < 上級者 < 内定者
function getLevelRank(level: string | null): number {
  if (!level) return -1;
  if (level.startsWith("内定者")) return 3;
  if (level.startsWith("上級者")) return 2;
  if (level.startsWith("中級者")) return 1;
  if (level.startsWith("初級者")) return 0;
  return -1;
}

function getLevelColor(level: string | null): string {
  const rank = getLevelRank(level);
  switch (rank) {
    case 0: return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case 1: return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case 2: return "bg-orange-500/20 text-orange-300 border-orange-500/30";
    case 3: return "bg-red-500/20 text-red-300 border-red-500/30";
    default: return "";
  }
}

function getLevelLabel(level: string | null): string | null {
  if (!level) return null;
  const colonIndex = level.indexOf("：");
  if (colonIndex === -1) return level;
  return level.substring(0, colonIndex);
}

function getLevelDetail(level: string | null): string | null {
  if (!level) return null;
  const colonIndex = level.indexOf("：");
  if (colonIndex === -1) return null;
  return level.substring(colonIndex + 1);
}

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-gray-600">—</span>;
  const label = getLevelLabel(level);
  const detail = getLevelDetail(level);
  const color = getLevelColor(level);

  return (
    <div className="space-y-1">
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
        {label}
      </span>
      {detail && (
        <p className="text-xs text-gray-400 leading-relaxed">{detail}</p>
      )}
    </div>
  );
}

export default function ProgressSheetsPage() {
  const sheets = mockProgressSheets;

  return (
    <div className="p-5 bg-surface min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-white">メンターからのFB</h1>
        <span className="text-xs text-gray-500">全 {sheets.length} 回</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#1a1f3d]">
              <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap">指導日</th>
              <th className="border-b border-white/10 px-3 py-2.5 text-center text-xs font-semibold text-gray-300 whitespace-nowrap">回次</th>
              <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap">解いた問題</th>
              <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap min-w-[160px]">レベル(フェルミ)</th>
              <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap min-w-[160px]">レベル(ケース)</th>
              <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap min-w-[160px]">レベル(McK)</th>
              <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap min-w-[220px]">成長した点・良かった点</th>
              <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap min-w-[220px]">FBした点・改善点</th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((sheet, i) => (
              <tr
                key={sheet.id}
                className={`${i % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.04]"} hover:bg-white/[0.07] transition-colors`}
              >
                <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 whitespace-nowrap align-top text-xs">
                  {sheet.session_date}
                </td>
                <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 text-center align-top text-xs">
                  {sheet.session_number || ""}
                </td>
                <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-200 align-top whitespace-pre-wrap text-xs font-medium">
                  {sheet.problem_solved || ""}
                </td>
                <td className="border-b border-white/[0.06] px-3 py-2.5 align-top">
                  <LevelBadge level={sheet.level_fermi} />
                </td>
                <td className="border-b border-white/[0.06] px-3 py-2.5 align-top">
                  <LevelBadge level={sheet.level_case} />
                </td>
                <td className="border-b border-white/[0.06] px-3 py-2.5 align-top">
                  <LevelBadge level={sheet.level_mck} />
                </td>
                <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 align-top whitespace-pre-wrap text-xs leading-relaxed">
                  {sheet.good_points || ""}
                </td>
                <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 align-top whitespace-pre-wrap text-xs leading-relaxed">
                  {sheet.improvement_points || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* レベル凡例 */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
        <span>レベル凡例:</span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/40" /> 初級者
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/40" /> 中級者
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-orange-500/40" /> 上級者
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/40" /> 内定者
        </span>
      </div>
    </div>
  );
}
