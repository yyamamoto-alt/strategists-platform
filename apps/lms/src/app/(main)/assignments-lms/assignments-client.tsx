"use client";

interface Assignment {
  id: string;
  customer_name: string | null;
  raw_data: Record<string, string>;
  applied_at: string;
}

export function AssignmentsClient({ assignments }: { assignments: Assignment[] }) {
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
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#1a1f3d]">
                <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap">提出日時</th>
                <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap">問題タイプ</th>
                <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap">解いた問題</th>
                <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap">担当メンター</th>
                <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap">思考時間</th>
                <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap min-w-[250px]">施策仮説(結論)</th>
                <th className="border-b border-white/10 px-3 py-2.5 text-left text-xs font-semibold text-gray-300 whitespace-nowrap">満足度</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a, i) => {
                const d = a.raw_data;
                return (
                  <tr
                    key={a.id}
                    className={`${i % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.04]"} hover:bg-white/[0.07] transition-colors`}
                  >
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 whitespace-nowrap align-top text-xs">
                      {d["タイムスタンプ"] || ""}
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 align-top text-xs">
                      {d["問題タイプ"] || ""}
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-200 align-top text-xs font-medium">
                      {d["解いた問題"] || ""}
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 align-top text-xs">
                      {d["担当メンター"] || ""}
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 align-top text-xs">
                      {d["思考時間"] || ""}
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 align-top whitespace-pre-wrap text-xs leading-relaxed">
                      {d["施策仮説(結論)"] || ""}
                    </td>
                    <td className="border-b border-white/[0.06] px-3 py-2.5 text-gray-300 align-top text-xs">
                      {d["前回メンタリングの満足度"] || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
