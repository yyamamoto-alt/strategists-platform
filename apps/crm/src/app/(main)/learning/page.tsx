"use client";

import Link from "next/link";
import { mockCustomers } from "@/lib/mock-data";
import { formatDate, formatPercent } from "@/lib/utils";

export default function LearningPage() {
  const learnersRaw = mockCustomers.filter((c) => c.learning);
  const learners = learnersRaw.map((c) => ({
    ...c,
    learning: c.learning!,
  }));

  const avgAttendance =
    learners.filter((l) => l.learning.attendance_rate !== null).length > 0
      ? learners
          .filter((l) => l.learning.attendance_rate !== null)
          .reduce((sum, l) => sum + (l.learning.attendance_rate || 0), 0) /
        learners.filter((l) => l.learning.attendance_rate !== null).length
      : 0;

  const avgSessions =
    learners.length > 0
      ? learners.reduce((sum, l) => sum + l.learning.total_sessions, 0) /
        learners.length
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
        <h1 className="text-2xl font-bold text-gray-900">学習管理</h1>
        <p className="text-sm text-gray-500 mt-1">
          受講生の学習状況・指導記録
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">受講生数</p>
          <p className="text-2xl font-bold mt-1">{learners.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">平均出席率</p>
          <p className="text-2xl font-bold mt-1">{formatPercent(avgAttendance)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">平均セッション数</p>
          <p className="text-2xl font-bold mt-1">{avgSessions.toFixed(1)}</p>
        </div>
        {Object.entries(levelCounts).map(([level, count]) => (
          <div key={level} className="bg-white rounded-xl shadow-sm border p-4">
            <p className="text-xs text-gray-500">{level}</p>
            <p className="text-2xl font-bold mt-1">{count}名</p>
          </div>
        ))}
      </div>

      {/* 受講生テーブル */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
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
              <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4">
                  <Link href={`/customers/${l.id}`} className="font-medium text-sm hover:text-primary-600">
                    {l.name}
                  </Link>
                </td>
                <td className="py-3 px-4 text-sm">{formatDate(l.learning.coaching_start_date)}</td>
                <td className="py-3 px-4 text-sm">{formatDate(l.learning.coaching_end_date)}</td>
                <td className="py-3 px-4 text-sm text-center">{l.learning.total_sessions}</td>
                <td className="py-3 px-4 text-center">
                  {l.learning.attendance_rate !== null ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${(l.learning.attendance_rate || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs">{formatPercent(l.learning.attendance_rate)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  {l.learning.curriculum_progress !== null ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${(l.learning.curriculum_progress || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs">{formatPercent(l.learning.curriculum_progress)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {l.learning.current_level ? (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      l.learning.current_level === "上級者"
                        ? "bg-green-100 text-green-800"
                        : l.learning.current_level === "中級者"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {l.learning.current_level}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="py-3 px-4 text-sm text-gray-600">{l.learning.latest_evaluation || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
