"use client";

import { mockEnrollments, mockCourses } from "@/lib/mock-data";
import { Calendar, AlertTriangle } from "lucide-react";

const statusColors: Record<string, string> = {
  on_track: "bg-green-900/50 text-green-300",
  slightly_behind: "bg-yellow-900/50 text-yellow-300",
  behind: "bg-orange-900/50 text-orange-300",
  at_risk: "bg-red-900/50 text-red-300",
};
const statusLabels: Record<string, string> = {
  on_track: "順調", slightly_behind: "やや遅れ", behind: "遅れ", at_risk: "要注意",
};

export default function SchedulePage() {
  const getDaysRemaining = (deadline: string | null) => {
    if (!deadline) return null;
    return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="mb-6"><h1 className="text-2xl font-bold text-white">スケジュール</h1><p className="text-sm text-gray-400 mt-1">受講スケジュールと進捗の確認</p></div>
      {mockEnrollments.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>受講中のコースはありません</p></div>
      ) : (
        <div className="space-y-4">
          {mockEnrollments.map((enrollment) => {
            const course = mockCourses.find((c) => c.id === enrollment.course_id);
            const daysLeft = getDaysRemaining(enrollment.deadline);
            return (
              <div key={enrollment.id} className="bg-surface-elevated rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div><h3 className="text-lg font-semibold text-white">{course?.title || "コース"}</h3><p className="text-sm text-gray-400 mt-1">{course?.category || ""}</p></div>
                  <span className={`text-xs px-3 py-1 rounded-full ${statusColors[enrollment.schedule_status || "on_track"]}`}>{statusLabels[enrollment.schedule_status || "on_track"]}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-surface-card rounded-lg p-3"><p className="text-xs text-gray-500 mb-1">受講開始</p><p className="text-sm text-white">{new Date(enrollment.enrolled_at).toLocaleDateString("ja-JP")}</p></div>
                  <div className="bg-surface-card rounded-lg p-3"><p className="text-xs text-gray-500 mb-1">期限</p><p className="text-sm text-white">{enrollment.deadline ? new Date(enrollment.deadline).toLocaleDateString("ja-JP") : "未設定"}</p></div>
                  <div className="bg-surface-card rounded-lg p-3"><p className="text-xs text-gray-500 mb-1">残り日数</p><div className="flex items-center gap-1">{daysLeft !== null && daysLeft <= 7 && <AlertTriangle className="w-3 h-3 text-red-400" />}<p className={`text-sm font-semibold ${daysLeft !== null && daysLeft <= 7 ? "text-red-400" : "text-white"}`}>{daysLeft !== null ? `${daysLeft}日` : "-"}</p></div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
