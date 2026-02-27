"use client";

import Link from "next/link";
import { formatDate, formatPercent } from "@/lib/utils";
import type { CustomerWithRelations } from "@strategy-school/shared-db";

interface LearningClientProps {
  customers: CustomerWithRelations[];
}

export function LearningClient({ customers }: LearningClientProps) {
  const learners = customers
    .filter((c) => c.learning)
    .map((c) => ({ ...c, learning: c.learning! }));

  const avgAttendance =
    learners.filter((l) => l.learning.attendance_rate !== null).length > 0
      ? learners
          .filter((l) => l.learning.attendance_rate !== null)
          .reduce((sum, l) => sum + (l.learning.attendance_rate || 0), 0) /
        learners.filter((l) => l.learning.attendance_rate !== null).length
      : 0;

  const avgSessions =
    learners.length > 0
      ? learners.reduce((sum, l) => sum + l.learning.total_sessions, 0) / learners.length
      : 0;

  const levelCounts = learners.reduce(
    (acc, l) => {
      const level = l.learning.current_level || "未設定";
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">学習管理</h1>
        <p className="text-sm text-gray-500 mt-1">受講生の学習状況・指導記録</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">受講生数</p>
          <p className="text-2xl font-bold text-white mt-1">{learners.length}</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">平均出席率</p>
          <p className="text-2xl font-bold text-white mt-1">{formatPercent(avgAttendance)}</p>
        </div>
        <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
          <p className="text-xs text-gray-500">平均セッション数</p>
          <p className="text-2xl font-bold text-white mt-1">{avgSessions.toFixed(1)}</p>
        </div>
        {Object.entries(levelCounts).map(([level, count]) => (
          <div key={level} className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4">
            <p className="text-xs text-gray-500">{level}</p>
            <p className="text-2xl font-bold text-white mt-1">{count}名</p>
          </div>
        ))}
      </div>

      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-elevated border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">受講生</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">開始日</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">終了日</th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500">セッション数</th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500">出席率</th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500">進捗</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">レベル</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">最新評価</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => (
              <tr key={l.id} className="border-b border-white/[0.08] hover:bg-white/5">
                <td className="py-3 px-4">
                  <Link href={`/customers/${l.id}`} className="font-medium text-sm text-white hover:text-brand">
                    {l.name}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm text-gray-300">{formatDate(l.learning.coaching_start_date)}</td>
                <td className="py-3 px-4 text-sm text-gray-300">{formatDate(l.learning.coaching_end_date)}</td>
                <td className="py-3 px-4 text-sm text-center text-gray-300">{l.learning.total_sessions}</td>
                <td className="py-3 px-4 text-center">
                  {l.learning.attendance_rate !== null ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 bg-white/10 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${(l.learning.attendance_rate || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-300">{formatPercent(l.learning.attendance_rate)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  {l.learning.curriculum_progress !== null ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 bg-white/10 rounded-full h-2">
                        <div
                          className="bg-brand h-2 rounded-full"
                          style={{ width: `${(l.learning.curriculum_progress || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-300">{formatPercent(l.learning.curriculum_progress)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {l.learning.current_level ? (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      l.learning.current_level === "上級者"
                        ? "bg-green-900/20 text-green-400"
                        : l.learning.current_level === "中級者"
                        ? "bg-brand-muted text-brand"
                        : "bg-white/10 text-gray-300"
                    }`}>
                      {l.learning.current_level}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4 text-sm text-gray-400">{l.learning.latest_evaluation || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
