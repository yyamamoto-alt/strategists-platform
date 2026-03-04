"use client";

import { mockProgressSheets } from "@/lib/mock-data";

export default function ProgressSheetsPage() {
  const sheets = mockProgressSheets;

  return (
    <div className="p-4 bg-surface min-h-screen">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#1a1f3d] text-white text-xs">
              <th className="border border-[#2a2f5d] px-3 py-2 text-left whitespace-nowrap font-semibold">添削日</th>
              <th className="border border-[#2a2f5d] px-3 py-2 text-left whitespace-nowrap font-semibold">回次</th>
              <th className="border border-[#2a2f5d] px-3 py-2 text-left whitespace-nowrap font-semibold">解いた問題</th>
              <th className="border border-[#2a2f5d] px-3 py-2 text-left whitespace-nowrap font-semibold">レベル(フェルミ)</th>
              <th className="border border-[#2a2f5d] px-3 py-2 text-left whitespace-nowrap font-semibold">レベル(ケース)</th>
              <th className="border border-[#2a2f5d] px-3 py-2 text-left whitespace-nowrap font-semibold">レベル(McK)</th>
              <th className="border border-[#2a2f5d] px-3 py-2 text-left whitespace-nowrap font-semibold min-w-[200px]">通過した足・買かった足・敗退・改善</th>
              <th className="border border-[#2a2f5d] px-3 py-2 text-left whitespace-nowrap font-semibold">PBもしくは最優先改善</th>
              <th className="border border-[#2a2f5d] px-3 py-2 text-left whitespace-nowrap font-semibold">次回までの課題</th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((sheet, i) => (
              <tr
                key={sheet.id}
                className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                <td className="border border-gray-200 px-3 py-2 text-gray-800 whitespace-nowrap align-top">
                  {sheet.session_date}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-gray-800 text-center align-top">
                  {sheet.session_number || ""}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-gray-800 align-top whitespace-pre-wrap min-w-[150px]">
                  {sheet.problem_solved || ""}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-gray-800 align-top whitespace-pre-wrap min-w-[180px]">
                  {sheet.level_fermi || ""}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-gray-800 align-top whitespace-pre-wrap min-w-[180px]">
                  {sheet.level_case || ""}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-gray-800 align-top whitespace-pre-wrap min-w-[150px]">
                  {sheet.level_mck || ""}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-gray-800 align-top whitespace-pre-wrap min-w-[200px]">
                  {sheet.progress_notes || ""}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-gray-800 align-top whitespace-pre-wrap min-w-[200px]">
                  {sheet.pb_or_priority || ""}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-gray-800 align-top whitespace-pre-wrap min-w-[200px]">
                  {sheet.next_assignment || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
