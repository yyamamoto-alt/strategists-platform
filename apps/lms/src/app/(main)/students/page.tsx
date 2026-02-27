import { Users } from "lucide-react";
import Link from "next/link";
import { createLmsServerClient } from "@/lib/supabase/server";

export default async function StudentsPage() {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

  if (useMock) {
    return (
      <div className="p-6 bg-surface min-h-screen">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">受講生管理</h1>
          <p className="text-sm text-gray-400 mt-1">受講生の一覧と管理</p>
        </div>
        <div className="text-center py-12 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>モックモードでは受講生データは表示されません</p>
        </div>
      </div>
    );
  }

  // 実データモード: learning_records + customers から取得
  const supabase = await createLmsServerClient();

  const { data: learningRecords, error } = await supabase
    .from("learning_records")
    .select(`
      *,
      customer:customers (id, name, email, attribute, university)
    `)
    .order("coaching_start_date", { ascending: false });

  if (error) {
    console.error("Failed to fetch students:", error);
  }

  const students = learningRecords || [];

  return (
    <div className="p-6 bg-surface min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">受講生管理</h1>
        <p className="text-sm text-gray-400 mt-1">
          {students.length}名の受講生
        </p>
      </div>

      {students.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>受講生データがありません</p>
        </div>
      ) : (
        <div className="bg-surface-card rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-elevated border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">受講生</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">属性</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">開始日</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">終了日</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500">セッション数</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">レベル</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s: any) => (
                <tr key={s.id} className="border-b border-white/[0.08] hover:bg-white/5">
                  <td className="py-3 px-4">
                    <p className="font-medium text-sm text-white">
                      {s.customer?.name || "不明"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {s.customer?.email || "-"}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-300">
                    {s.customer?.attribute || "-"}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-300">
                    {s.coaching_start_date || "-"}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-300">
                    {s.coaching_end_date || "-"}
                  </td>
                  <td className="py-3 px-4 text-sm text-center text-gray-300">
                    {s.total_sessions}
                  </td>
                  <td className="py-3 px-4">
                    {s.current_level ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.current_level === "上級者"
                          ? "bg-green-900/20 text-green-400"
                          : s.current_level === "中級者"
                          ? "bg-blue-900/20 text-blue-400"
                          : "bg-white/10 text-gray-300"
                      }`}>
                        {s.current_level}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
