"use client";

import type { MentorReport } from "./page";

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

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-gray-600">—</span>;
  const label = getLevelLabel(level);
  const detail = level.includes("：") ? level.substring(level.indexOf("：") + 1) : null;
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

export function ProgressSheetsClient({ reports }: { reports: MentorReport[] }) {
  return (
    <div className="p-5 bg-surface min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-white">メンターからのFB</h1>
        <span className="text-xs text-gray-500">全 {reports.length} 件</span>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>指導報告データはまだありません</p>
        </div>
      ) : (
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
                <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap min-w-[220px]">よかった点・成長した点</th>
                <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap min-w-[220px]">課題・改善点</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report, i) => {
                const d = report.raw_data;
                return (
                  <tr
                    key={report.id}
                    className={`${i % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.04]"} hover:bg-white/[0.07] transition-colors`}
                  >
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 whitespace-nowrap align-top text-xs">
                      {d["指導日"] || ""}
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 text-center align-top text-xs">
                      {d["回次（合計指導回数）"] || ""}
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-200 align-top text-xs font-medium">
                      {d["解いた問題"] || ""}
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 align-top">
                      <LevelBadge level={report.level_fermi} />
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 align-top">
                      <LevelBadge level={report.level_case} />
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 align-top">
                      <LevelBadge level={report.level_mck} />
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 align-top whitespace-pre-wrap text-xs leading-relaxed">
                      {d["よかった点・成長した点"] || ""}
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 align-top whitespace-pre-wrap text-xs leading-relaxed">
                      {d["課題・改善点"] || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
