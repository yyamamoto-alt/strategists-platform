"use client";

import { formatCurrency } from "@/lib/utils";
import { ChannelMetrics } from "@/types/database";

interface ChannelTableProps {
  data: ChannelMetrics[];
}

export function ChannelTable({ data }: ChannelTableProps) {
  const sorted = [...data].sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">
              チャネル
            </th>
            <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">
              申込数
            </th>
            <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">
              成約数
            </th>
            <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">
              CVR
            </th>
            <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">
              売上
            </th>
            <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">
              LTV
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.channel}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="py-2 px-2 font-medium">{row.channel}</td>
              <td className="py-2 px-2 text-right">{row.applications}</td>
              <td className="py-2 px-2 text-right">{row.closings}</td>
              <td className="py-2 px-2 text-right">
                {row.applications > 0
                  ? `${Math.round((row.closings / row.applications) * 100)}%`
                  : "-"}
              </td>
              <td className="py-2 px-2 text-right">
                {formatCurrency(row.revenue)}
              </td>
              <td className="py-2 px-2 text-right">
                {formatCurrency(row.ltv)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
