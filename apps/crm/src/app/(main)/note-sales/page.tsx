export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";

export const revalidate = 60;

interface NoteOrder {
  id: string;
  amount: number | null;
  paid_at: string | null;
  contact_name: string | null;
  product_name: string | null;
  order_type: string | null;
  source_record_id: string | null;
  created_at: string | null;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  note_textbook: "教科書",
  note_magazine: "マガジン",
  note_video: "動画講座",
};

const ORDER_TYPE_COLORS: Record<string, string> = {
  note_textbook: "bg-blue-100 text-blue-800",
  note_magazine: "bg-purple-100 text-purple-800",
  note_video: "bg-green-100 text-green-800",
};

function formatJST(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatYen(amount: number | null): string {
  if (amount == null) return "-";
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  // JST変換: UTC+9
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, "0")}`;
}

function computeMonthlySummary(orders: NoteOrder[]) {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentYear = jstNow.getFullYear();
  const currentMonth = jstNow.getMonth() + 1;

  const months = [0, 1, 2].map((offset) => {
    const d = new Date(currentYear, currentMonth - 1 - offset, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label:
        offset === 0
          ? "今月"
          : offset === 1
            ? "先月"
            : "先々月",
      total: 0,
      count: 0,
    };
  });

  const monthKeys = new Set(months.map((m) => m.key));

  for (const order of orders) {
    if (!order.paid_at || order.amount == null) continue;
    const key = getMonthKey(order.paid_at);
    if (monthKeys.has(key)) {
      const month = months.find((m) => m.key === key);
      if (month) {
        month.total += order.amount;
        month.count += 1;
      }
    }
  }

  return months;
}

export default async function NoteSalesPage() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders } = await (supabase as any)
    .from("orders")
    .select(
      "id, amount, paid_at, contact_name, product_name, order_type, source_record_id, created_at"
    )
    .eq("source", "note")
    .order("paid_at", { ascending: false });

  const noteOrders: NoteOrder[] = (orders || []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (row: any) => ({
      id: row.id as string,
      amount: row.amount as number | null,
      paid_at: row.paid_at as string | null,
      contact_name: row.contact_name as string | null,
      product_name: row.product_name as string | null,
      order_type: row.order_type as string | null,
      source_record_id: row.source_record_id as string | null,
      created_at: row.created_at as string | null,
    })
  );

  const monthlySummary = computeMonthlySummary(noteOrders);

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-white">note購入履歴</h1>
        <p className="text-sm text-gray-400 mt-1">
          noteの購入レコード一覧（{noteOrders.length}件）
        </p>
      </div>

      {/* 月別サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {monthlySummary.map((month) => (
          <div
            key={month.key}
            className="bg-surface-raised border border-white/10 rounded-xl p-5"
          >
            <p className="text-xs text-gray-400 mb-1">{month.label}</p>
            <p className="text-2xl font-bold text-white">
              {formatYen(month.total)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{month.count}件</p>
          </div>
        ))}
      </div>

      {/* テーブル */}
      <div className="bg-surface-raised border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  購入日時
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  購入者
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  商品名
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  金額
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  商品タイプ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {noteOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    購入データがありません
                  </td>
                </tr>
              ) : (
                noteOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {formatJST(order.paid_at)}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {order.contact_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-300 max-w-xs truncate">
                      {order.product_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-medium whitespace-nowrap">
                      {formatYen(order.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {order.order_type ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_TYPE_COLORS[order.order_type] || "bg-gray-100 text-gray-800"}`}
                        >
                          {ORDER_TYPE_LABELS[order.order_type] ||
                            order.order_type}
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
