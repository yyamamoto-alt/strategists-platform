"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDate, formatCurrency } from "@/lib/utils";

interface UnmatchedOrder {
  id: string;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  amount: number;
  product_name: string | null;
  source: string;
  paid_at: string | null;
  payment_method: string | null;
}

interface CustomerCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  apps: "Apps",
  bank_transfer: "銀行振込",
  stripe: "Stripe",
  manual: "手動",
  excel_migration: "Excel移行",
  freee: "Freee",
};

export default function UnmatchedOrdersPage() {
  const [orders, setOrders] = useState<UnmatchedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<Record<string, CustomerCandidate[]>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [rematchResult, setRematchResult] = useState<string | null>(null);

  const fetchUnmatched = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders/unmatched");
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnmatched();
  }, [fetchUnmatched]);

  const handleRematchAll = async () => {
    setProcessing("rematch");
    try {
      const res = await fetch("/api/orders/rematch", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setRematchResult(
          `自動マッチ完了: ${result.matched}件マッチ / ${result.still_unmatched}件未マッチ`
        );
        await fetchUnmatched();
      }
    } finally {
      setProcessing(null);
    }
  };

  const handleSearch = async (orderId: string, query: string) => {
    if (!query || query.length < 2) {
      setCandidates((prev) => ({ ...prev, [orderId]: [] }));
      return;
    }

    try {
      const res = await fetch(
        `/api/customers?search=${encodeURIComponent(query)}&limit=5`
      );
      if (res.ok) {
        const data = await res.json();
        setCandidates((prev) => ({
          ...prev,
          [orderId]: (data.customers || data || []).map(
            (c: { id: string; name: string; email: string | null; phone: string | null }) => ({
              id: c.id,
              name: c.name,
              email: c.email,
              phone: c.phone,
            })
          ),
        }));
      }
    } catch {
      // ignore
    }
  };

  const handleAction = async (
    orderId: string,
    action: "link" | "create" | "ignore",
    customerId?: string
  ) => {
    setProcessing(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/match`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, customer_id: customerId }),
      });
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      }
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">未マッチ注文管理</h1>
          <p className="text-xs text-gray-500">
            顧客DBに紐付いていない注文を管理します
          </p>
        </div>
        <button
          onClick={handleRematchAll}
          disabled={processing === "rematch"}
          className="px-4 py-2 bg-brand text-white text-sm rounded-lg hover:bg-brand/80 disabled:opacity-50 transition-colors"
        >
          {processing === "rematch" ? "処理中..." : "一括自動マッチ"}
        </button>
      </div>

      {rematchResult && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm text-green-400">
          {rematchResult}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-500">読み込み中...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          未マッチの注文はありません
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">{orders.length}件の未マッチ注文</p>
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-surface-card rounded-xl border border-white/10 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium">
                      {order.contact_name || "名前なし"}
                    </span>
                    <span className="text-sm font-bold text-white">
                      {formatCurrency(order.amount)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {SOURCE_LABELS[order.payment_method || ""] ||
                        SOURCE_LABELS[order.source] ||
                        order.source}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 space-x-4">
                    <span>{order.contact_email || "メールなし"}</span>
                    <span>{order.product_name || ""}</span>
                    <span>{formatDate(order.paid_at)}</span>
                  </div>

                  {/* 顧客検索 */}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="顧客を検索（名前・メール）..."
                      value={searchQuery[order.id] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchQuery((prev) => ({
                          ...prev,
                          [order.id]: val,
                        }));
                        handleSearch(order.id, val);
                      }}
                      className="flex-1 max-w-xs px-2 py-1 bg-surface-elevated border border-white/10 text-white placeholder-gray-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>

                  {/* 候補リスト */}
                  {candidates[order.id]?.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {candidates[order.id].map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between bg-surface-elevated rounded px-3 py-1.5"
                        >
                          <div>
                            <span className="text-sm text-white">
                              {c.name}
                            </span>
                            <span className="text-xs text-gray-400 ml-2">
                              {c.email || ""}
                            </span>
                          </div>
                          <button
                            onClick={() => handleAction(order.id, "link", c.id)}
                            disabled={processing === order.id}
                            className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded hover:bg-green-500/30 disabled:opacity-50"
                          >
                            紐付け
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* アクションボタン */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      if (window.confirm(`「${order.contact_name || "名前なし"}」を新規顧客として作成しますか？\n\n既存の顧客DBに同一人物がいないか確認してください。`)) {
                        handleAction(order.id, "create");
                      }
                    }}
                    disabled={processing === order.id}
                    className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs rounded hover:bg-blue-500/30 disabled:opacity-50"
                  >
                    新規顧客作成
                  </button>
                  <button
                    onClick={() => handleAction(order.id, "ignore")}
                    disabled={processing === order.id}
                    className="px-3 py-1 bg-gray-500/20 text-gray-400 text-xs rounded hover:bg-gray-500/30 disabled:opacity-50"
                  >
                    無視
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
