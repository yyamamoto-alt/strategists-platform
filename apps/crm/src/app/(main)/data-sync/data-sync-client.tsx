"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  SpreadsheetConnection,
  SyncLog,
  UnmatchedRecord,
} from "@/lib/data/spreadsheet-sync";

type Tab = "connections" | "unmatched" | "logs";

interface DataSyncClientProps {
  initialConnections: SpreadsheetConnection[];
  initialSyncLogs: SyncLog[];
  initialUnmatched: UnmatchedRecord[];
}

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

// ================================================================
// メインコンポーネント
// ================================================================

export function DataSyncClient({
  initialConnections,
  initialSyncLogs,
  initialUnmatched,
}: DataSyncClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("connections");
  const [connections, setConnections] = useState(initialConnections);
  const [syncLogs, setSyncLogs] = useState(initialSyncLogs);
  const [unmatched, setUnmatched] = useState(initialUnmatched);

  // 接続追加フォーム
  const [showAddForm, setShowAddForm] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // プレビュー結果
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewSheets, setPreviewSheets] = useState<string[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewSpreadsheetId, setPreviewSpreadsheetId] = useState("");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewLoaded, setPreviewLoaded] = useState(false);

  // マッピングUI
  const [mappingFields, setMappingFields] = useState<Record<string, string>>({});

  // 同期中
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // マッピング編集
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [editMappingFields, setEditMappingFields] = useState<Record<string, string>>({});
  const [isSavingMapping, setIsSavingMapping] = useState(false);

  // 顧客検索（未マッチ紐付け用）
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string | null; attribute: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "connections", label: "接続一覧" },
    { key: "unmatched", label: "未マッチレコード", count: unmatched.length },
    { key: "logs", label: "同期ログ" },
  ];

  const CRM_FIELDS = [
    { key: "email", label: "メールアドレス" },
    { key: "name", label: "氏名" },
    { key: "phone", label: "電話番号" },
    { key: "university", label: "大学" },
    { key: "faculty", label: "学部" },
    { key: "attribute", label: "属性（既卒/新卒）" },
    { key: "career_history", label: "経歴" },
    { key: "utm_source", label: "UTMソース" },
    { key: "utm_medium", label: "UTMメディア" },
  ];

  // ================================================================
  // 未マッピング列検出
  // ================================================================

  function getUnmappedHeaders(conn: SpreadsheetConnection): string[] {
    const knownHeaders = conn.known_headers || [];
    if (knownHeaders.length === 0) return [];
    const mappedSheetCols = new Set(Object.values(conn.column_mapping || {}));
    return knownHeaders.filter((h) => h && !mappedSheetCols.has(h));
  }

  const totalUnmapped = connections.reduce(
    (sum, conn) => sum + getUnmappedHeaders(conn).length,
    0
  );

  // ================================================================
  // マッピング編集の保存
  // ================================================================

  const startEditMapping = useCallback((conn: SpreadsheetConnection) => {
    setEditingMappingId(conn.id);
    setEditMappingFields({ ...conn.column_mapping });
  }, []);

  const saveMapping = useCallback(async () => {
    if (!editingMappingId) return;
    setIsSavingMapping(true);
    try {
      const res = await fetch(`/api/spreadsheets/${editingMappingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_mapping: editMappingFields }),
      });
      if (res.ok) {
        const updated = await res.json();
        setConnections((prev) =>
          prev.map((c) => (c.id === editingMappingId ? updated : c))
        );
        setEditingMappingId(null);
      } else {
        const data = await res.json();
        alert(`保存エラー: ${data.error || "不明なエラー"}`);
      }
    } finally {
      setIsSavingMapping(false);
    }
  }, [editingMappingId, editMappingFields]);

  const updateEditMapping = useCallback((crmField: string, sheetColumn: string) => {
    setEditMappingFields((prev) => {
      if (!sheetColumn) {
        const next = { ...prev };
        delete next[crmField];
        return next;
      }
      return { ...prev, [crmField]: sheetColumn };
    });
  }, []);

  // ================================================================
  // ヘッダー更新（既存接続のknown_headersを最新化）
  // ================================================================

  const [refreshingHeadersId, setRefreshingHeadersId] = useState<string | null>(null);

  const refreshHeaders = useCallback(async (connId: string) => {
    setRefreshingHeadersId(connId);
    try {
      // preview API でシートヘッダーを取得
      const previewRes = await fetch(`/api/spreadsheets/${connId}/preview`);
      if (!previewRes.ok) {
        alert("ヘッダー取得に失敗しました");
        return;
      }
      const { headers: latestHeaders } = await previewRes.json();

      // known_headers を更新
      const patchRes = await fetch(`/api/spreadsheets/${connId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ known_headers: latestHeaders }),
      });
      if (patchRes.ok) {
        const updated = await patchRes.json();
        setConnections((prev) =>
          prev.map((c) => (c.id === connId ? updated : c))
        );
      }
    } finally {
      setRefreshingHeadersId(null);
    }
  }, []);

  // ================================================================
  // URL からプレビュー取得（DB保存不要）
  // ================================================================

  const loadPreviewFromUrl = useCallback(
    async (url: string, sheet?: string) => {
      if (!url.trim()) return;
      setIsLoadingPreview(true);
      setPreviewError("");
      try {
        const params = new URLSearchParams({ url: url.trim() });
        if (sheet) params.set("sheet", sheet);
        const res = await fetch(`/api/spreadsheets/preview-url?${params}`);
        const data = await res.json();
        if (!res.ok) {
          setPreviewError(data.error || "取得に失敗しました");
          return;
        }
        setPreviewSpreadsheetId(data.spreadsheet_id);
        setPreviewTitle(data.title);
        setPreviewSheets(data.sheets || []);
        setPreviewHeaders(data.headers || []);
        if (!sheet && data.sheets?.length > 0) {
          setSelectedSheet(data.sheets[0]);
        }
        setPreviewLoaded(true);
      } catch {
        setPreviewError("接続エラーが発生しました");
      } finally {
        setIsLoadingPreview(false);
      }
    },
    []
  );

  // シート変更時にヘッダーを再取得
  const handleSheetChange = useCallback(
    (sheet: string) => {
      setSelectedSheet(sheet);
      setMappingFields({});
      if (formUrl.trim()) {
        loadPreviewFromUrl(formUrl, sheet);
      }
    },
    [formUrl, loadPreviewFromUrl]
  );

  // ================================================================
  // 接続追加（保存）
  // ================================================================

  const addConnection = useCallback(async () => {
    if (!previewSpreadsheetId || !previewTitle) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/spreadsheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: previewTitle,
          spreadsheet_id: previewSpreadsheetId,
          sheet_name: selectedSheet || "Sheet1",
          column_mapping: mappingFields,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConnections((prev) => [data, ...prev]);
        resetAddForm();
      } else {
        const data = await res.json();
        alert(`保存エラー: ${data.error || "不明なエラー"}`);
      }
    } finally {
      setIsSaving(false);
    }
  }, [previewSpreadsheetId, previewTitle, selectedSheet, mappingFields]);

  const resetAddForm = useCallback(() => {
    setShowAddForm(false);
    setFormUrl("");
    setPreviewTitle("");
    setPreviewSheets([]);
    setPreviewHeaders([]);
    setPreviewSpreadsheetId("");
    setSelectedSheet("");
    setPreviewError("");
    setPreviewLoaded(false);
    setMappingFields({});
  }, []);

  // ================================================================
  // 接続削除
  // ================================================================

  const deleteConnection = useCallback(async (connId: string) => {
    if (!confirm("この接続を削除しますか？")) return;
    const res = await fetch(`/api/spreadsheets/${connId}`, { method: "DELETE" });
    if (res.ok) {
      setConnections((prev) => prev.filter((c) => c.id !== connId));
    }
  }, []);

  // ================================================================
  // 同期実行
  // ================================================================

  const runSync = useCallback(async (connId: string) => {
    setSyncingId(connId);
    try {
      const res = await fetch(`/api/spreadsheets/${connId}/sync`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok) {
        alert(
          `同期完了: ${data.rows_processed}行処理 (更新: ${data.rows_updated}, 未マッチ: ${data.rows_unmatched})`
        );
        const [connsRes, unmatchedRes] = await Promise.all([
          fetch("/api/spreadsheets"),
          fetch("/api/unmatched"),
        ]);
        if (connsRes.ok) setConnections(await connsRes.json());
        if (unmatchedRes.ok) setUnmatched(await unmatchedRes.json());
      } else {
        alert(`同期エラー: ${data.error}`);
      }
    } catch {
      alert("同期中にエラーが発生しました");
    } finally {
      setSyncingId(null);
    }
  }, []);

  // ================================================================
  // 未マッチレコード解決
  // ================================================================

  const resolveUnmatched = useCallback(
    async (recordId: string, action: "link" | "create" | "ignore", customerId?: string) => {
      const res = await fetch(`/api/unmatched/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, customer_id: customerId }),
      });

      if (res.ok) {
        setUnmatched((prev) => prev.filter((r) => r.id !== recordId));
        setLinkingId(null);
        setSearchQuery("");
        setSearchResults([]);
        setSelectedCustomerId("");
      } else {
        const data = await res.json();
        alert(`エラー: ${data.error}`);
      }
    },
    []
  );

  // ================================================================
  // 顧客名検索（debounce）
  // ================================================================
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchCustomers = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedCustomerId("");
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          setSearchResults(await res.json());
        }
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // 紐付け開始時に名前でプリフィル
  const startLinking = useCallback((record: UnmatchedRecord) => {
    setLinkingId(record.id);
    setSelectedCustomerId("");
    setSearchResults([]);
    if (record.name) {
      searchCustomers(record.name);
    }
  }, [searchCustomers]);

  // ================================================================
  // マッピングフィールド更新
  // ================================================================

  const updateMapping = useCallback((crmField: string, sheetColumn: string) => {
    setMappingFields((prev) => {
      if (!sheetColumn) {
        const next = { ...prev };
        delete next[crmField];
        return next;
      }
      return { ...prev, [crmField]: sheetColumn };
    });
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">データ連携</h1>
          <p className="text-sm text-gray-400 mt-1">
            Google Spreadsheet からの自動データ取込み設定
          </p>
        </div>
      </div>

      {/* 新カラム検知バナー */}
      {totalUnmapped > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-yellow-300 font-medium">
              {connections.filter((c) => getUnmappedHeaders(c).length > 0).length}件の接続で
              新しい列が検出されました（合計{totalUnmapped}列）
            </p>
            <p className="text-xs text-yellow-400/70 mt-0.5">
              Googleフォームに新しい項目が追加された可能性があります。マッピングを確認してください。
            </p>
          </div>
          <button
            onClick={() => setActiveTab("connections")}
            className="px-4 py-1.5 bg-yellow-500/20 text-yellow-300 rounded-lg text-xs font-medium hover:bg-yellow-500/30 transition-colors whitespace-nowrap"
          >
            確認する
          </button>
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-1 bg-surface-elevated rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.key
                ? "bg-brand text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* 接続一覧タブ */}
      {/* ================================================================ */}
      {activeTab === "connections" && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <button
              onClick={async () => {
                for (const conn of connections) {
                  await refreshHeaders(conn.id);
                }
              }}
              disabled={!!refreshingHeadersId}
              className="px-4 py-2 border border-white/10 text-gray-300 rounded-lg text-sm font-medium hover:bg-white/5 disabled:opacity-50 transition-colors"
            >
              {refreshingHeadersId ? "更新中..." : "全接続のヘッダー更新"}
            </button>
            <button
              onClick={() => {
                if (showAddForm) {
                  resetAddForm();
                } else {
                  setShowAddForm(true);
                }
              }}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors"
            >
              {showAddForm ? "キャンセル" : "+ 接続追加"}
            </button>
          </div>

          {/* 追加フォーム */}
          {showAddForm && (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-6 space-y-5">
              <h3 className="text-lg font-semibold text-white">
                Google Spreadsheet を接続
              </h3>

              {/* Step 1: URL入力 */}
              <div>
                <label className="text-sm text-gray-400 block mb-1.5">
                  Google SpreadsheetのURL
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && formUrl.trim()) {
                        loadPreviewFromUrl(formUrl);
                      }
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit"
                    className="flex-1 px-3 py-2.5 bg-[#1a1a2e] border border-white/15 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => loadPreviewFromUrl(formUrl)}
                    disabled={!formUrl.trim() || isLoadingPreview}
                    className="px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {isLoadingPreview ? (
                      <span className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        読込中
                      </span>
                    ) : (
                      "接続テスト"
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  ブラウザのアドレスバーからURLをコピー＆ペーストしてください
                </p>
              </div>

              {/* エラー表示 */}
              {previewError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                  {previewError}
                </div>
              )}

              {/* Step 2: プレビュー結果 */}
              {previewLoaded && (
                <div className="space-y-4 border-t border-white/10 pt-5">
                  {/* 接続名（自動取得） */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-24 shrink-0">接続名</span>
                    <span className="text-white font-medium">{previewTitle}</span>
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                      接続OK
                    </span>
                  </div>

                  {/* シート選択 */}
                  {previewSheets.length > 1 && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-24 shrink-0">シート</span>
                      <div className="flex flex-wrap gap-1.5">
                        {previewSheets.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleSheetChange(s)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                              selectedSheet === s
                                ? "bg-brand text-white"
                                : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* カラムマッピング */}
                  {previewHeaders.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-medium text-white">
                            カラムマッピング
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            CRMフィールドに対応するスプレッドシートの列を選択
                          </p>
                        </div>
                        <span className="text-xs text-gray-500">
                          {previewHeaders.length}列検出
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {CRM_FIELDS.map((field) => (
                          <div
                            key={field.key}
                            className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-3 py-2"
                          >
                            <span className="text-xs text-gray-400 w-28 shrink-0">
                              {field.label}
                            </span>
                            <select
                              value={mappingFields[field.key] || ""}
                              onChange={(e) =>
                                updateMapping(field.key, e.target.value)
                              }
                              className="flex-1 px-2 py-1.5 bg-[#1a1a2e] border border-white/10 rounded text-white text-xs focus:outline-none focus:border-brand appearance-none"
                            >
                              <option value="">-- 未設定 --</option>
                              {previewHeaders.map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {previewHeaders.length === 0 && (
                    <p className="text-sm text-yellow-400">
                      ヘッダー行が見つかりません。シートにデータがあるか確認してください。
                    </p>
                  )}

                  {/* 保存ボタン */}
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={addConnection}
                      disabled={!previewSpreadsheetId || isSaving}
                      className="px-6 py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSaving ? "保存中..." : "この接続を保存"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 接続一覧 */}
          {connections.length === 0 && !showAddForm ? (
            <div className="bg-surface-card rounded-xl border border-white/10 p-12 text-center">
              <div className="text-gray-500 mb-2 text-3xl">📊</div>
              <p className="text-gray-400 mb-1">接続がありません</p>
              <p className="text-xs text-gray-500">
                「+ 接続追加」からGoogle Spreadsheetを接続してください
              </p>
            </div>
          ) : connections.length > 0 ? (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left p-4 text-gray-400 font-medium">接続名</th>
                    <th className="text-left p-4 text-gray-400 font-medium">シート</th>
                    <th className="text-left p-4 text-gray-400 font-medium">同期モード</th>
                    <th className="text-left p-4 text-gray-400 font-medium">最終同期</th>
                    <th className="text-left p-4 text-gray-400 font-medium">同期行数</th>
                    <th className="text-left p-4 text-gray-400 font-medium">状態</th>
                    <th className="text-right p-4 text-gray-400 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((conn) => {
                    const unmapped = getUnmappedHeaders(conn);
                    const isEditing = editingMappingId === conn.id;
                    return (
                      <tr key={conn.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{conn.name}</span>
                            {unmapped.length > 0 && !isEditing && (
                              <button
                                onClick={() => startEditMapping(conn)}
                                className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px] font-medium animate-pulse hover:bg-yellow-500/30 transition-colors"
                                title={`未マッピング列: ${unmapped.join(", ")}`}
                              >
                                新規{unmapped.length}列
                              </button>
                            )}
                          </div>
                          {/* マッピング編集パネル */}
                          {isEditing && (
                            <div className="mt-3 p-4 bg-surface-elevated rounded-lg border border-white/10 space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium text-white">カラムマッピング編集</h4>
                                <span className="text-xs text-gray-500">
                                  {(conn.known_headers || []).length}列検出
                                  {unmapped.length > 0 && (
                                    <span className="ml-2 text-yellow-400">
                                      ({unmapped.length}件未マッピング)
                                    </span>
                                  )}
                                </span>
                              </div>
                              {/* 未マッピング列のハイライト */}
                              {unmapped.length > 0 && (
                                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                                  <p className="text-xs text-yellow-400 font-medium mb-1">
                                    新しい列が検出されました:
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {unmapped.map((h) => (
                                      <span key={h} className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-[11px]">
                                        {h}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {CRM_FIELDS.map((field) => (
                                  <div
                                    key={field.key}
                                    className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-3 py-2"
                                  >
                                    <span className="text-xs text-gray-400 w-28 shrink-0">
                                      {field.label}
                                    </span>
                                    <select
                                      value={editMappingFields[field.key] || ""}
                                      onChange={(e) =>
                                        updateEditMapping(field.key, e.target.value)
                                      }
                                      className="flex-1 px-2 py-1.5 bg-[#1a1a2e] border border-white/10 rounded text-white text-xs focus:outline-none focus:border-brand appearance-none"
                                    >
                                      <option value="">-- 未設定 --</option>
                                      {(conn.known_headers || []).map((h) => (
                                        <option key={h} value={h}>
                                          {h}
                                          {unmapped.includes(h) ? " (NEW)" : ""}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  onClick={() => setEditingMappingId(null)}
                                  className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                                >
                                  キャンセル
                                </button>
                                <button
                                  onClick={saveMapping}
                                  disabled={isSavingMapping}
                                  className="px-4 py-1.5 text-xs bg-brand text-white rounded-md hover:bg-brand/90 disabled:opacity-50 transition-colors"
                                >
                                  {isSavingMapping ? "保存中..." : "マッピングを保存"}
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-gray-300">{conn.sheet_name}</td>
                        <td className="p-4 text-gray-300">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              conn.sync_mode === "append"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-purple-500/20 text-purple-400"
                            }`}
                          >
                            {conn.sync_mode === "append" ? "差分" : "全件"}
                          </span>
                        </td>
                        <td className="p-4 text-gray-400 text-xs">
                          {formatDate(conn.last_synced_at)}
                        </td>
                        <td className="p-4 text-gray-300">{conn.last_synced_row}</td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              conn.is_active
                                ? "bg-green-500/20 text-green-400"
                                : "bg-gray-500/20 text-gray-400"
                            }`}
                          >
                            {conn.is_active ? "有効" : "無効"}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex gap-2 justify-end">
                            {!isEditing && (
                              <button
                                onClick={() => startEditMapping(conn)}
                                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-white/10 rounded-md hover:bg-white/5 transition-colors"
                              >
                                マッピング
                              </button>
                            )}
                            <button
                              onClick={() => runSync(conn.id)}
                              disabled={syncingId === conn.id}
                              className="px-3 py-1.5 text-xs text-brand hover:text-white border border-brand/30 rounded-md hover:bg-brand/10 disabled:opacity-50 transition-colors"
                            >
                              {syncingId === conn.id ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="w-3 h-3 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                                  同期中
                                </span>
                              ) : (
                                "同期実行"
                              )}
                            </button>
                            <button
                              onClick={() => deleteConnection(conn.id)}
                              className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/20 rounded-md hover:bg-red-500/10 transition-colors"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* ================================================================ */}
      {/* 未マッチレコードタブ */}
      {/* ================================================================ */}
      {activeTab === "unmatched" && (
        <div className="space-y-4">
          {unmatched.length === 0 ? (
            <div className="bg-surface-card rounded-xl border border-white/10 p-12 text-center">
              <p className="text-gray-400">未解決の未マッチレコードはありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {unmatched.map((record) => (
                <div
                  key={record.id}
                  className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-white font-medium">
                        {record.name || "名前不明"}
                      </p>
                      <div className="flex gap-4 text-sm text-gray-400">
                        {record.email && <span>Email: {record.email}</span>}
                        {record.phone && <span>Tel: {record.phone}</span>}
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatDate(record.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {linkingId === record.id ? (
                        <div className="space-y-2 w-full">
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => searchCustomers(e.target.value)}
                              placeholder="名前・メールで検索..."
                              className="px-2 py-1 bg-[#1a1a2e] border border-white/10 rounded text-white text-xs w-64 focus:outline-none focus:border-brand"
                              autoFocus
                            />
                            <button
                              onClick={() =>
                                resolveUnmatched(record.id, "link", selectedCustomerId)
                              }
                              disabled={!selectedCustomerId}
                              className="px-2 py-1 text-xs bg-brand text-white rounded disabled:opacity-50"
                            >
                              紐付け
                            </button>
                            <button
                              onClick={() => {
                                setLinkingId(null);
                                setSearchQuery("");
                                setSearchResults([]);
                                setSelectedCustomerId("");
                              }}
                              className="px-2 py-1 text-xs text-gray-400"
                            >
                              取消
                            </button>
                            {isSearchingCustomer && (
                              <span className="w-3 h-3 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                            )}
                          </div>
                          {searchResults.length > 0 && (
                            <div className="bg-[#1a1a2e] border border-white/10 rounded max-h-40 overflow-y-auto">
                              {searchResults.map((c) => (
                                <button
                                  key={c.id}
                                  onClick={() => setSelectedCustomerId(c.id)}
                                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 flex items-center gap-2 ${
                                    selectedCustomerId === c.id ? "bg-brand/20 text-white" : "text-gray-300"
                                  }`}
                                >
                                  <span className="font-medium">{c.name}</span>
                                  {c.email && <span className="text-gray-500">{c.email}</span>}
                                  <span className="text-gray-600 ml-auto">{c.attribute}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {searchQuery && searchResults.length === 0 && !isSearchingCustomer && (
                            <p className="text-xs text-gray-500 px-1">該当する顧客が見つかりません</p>
                          )}
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => startLinking(record)}
                            className="px-3 py-1.5 text-xs text-brand border border-brand/30 rounded hover:bg-brand/10"
                          >
                            既存顧客に紐付け
                          </button>
                          <button
                            onClick={() => resolveUnmatched(record.id, "create")}
                            className="px-3 py-1.5 text-xs text-green-400 border border-green-500/20 rounded hover:bg-green-500/10"
                          >
                            新規作成
                          </button>
                          <button
                            onClick={() => resolveUnmatched(record.id, "ignore")}
                            className="px-3 py-1.5 text-xs text-gray-400 border border-white/10 rounded hover:bg-white/5"
                          >
                            無視
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 元データ */}
                  {record.raw_data && Object.keys(record.raw_data).length > 0 && (
                    <details className="mt-3">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                        元データを表示
                      </summary>
                      <pre className="mt-2 p-3 bg-surface-elevated rounded-lg text-xs text-gray-300 overflow-x-auto max-h-40">
                        {JSON.stringify(record.raw_data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* 同期ログタブ */}
      {/* ================================================================ */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          {syncLogs.length === 0 ? (
            <div className="bg-surface-card rounded-xl border border-white/10 p-12 text-center">
              <p className="text-gray-400">同期ログがありません</p>
            </div>
          ) : (
            <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left p-4 text-gray-400 font-medium">実行日時</th>
                    <th className="text-left p-4 text-gray-400 font-medium">ステータス</th>
                    <th className="text-right p-4 text-gray-400 font-medium">処理行数</th>
                    <th className="text-right p-4 text-gray-400 font-medium">更新</th>
                    <th className="text-right p-4 text-gray-400 font-medium">未マッチ</th>
                    <th className="text-left p-4 text-gray-400 font-medium">エラー</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLogs.map((log) => (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-4 text-gray-300 text-xs">
                        {formatDate(log.started_at)}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            log.status === "success"
                              ? "bg-green-500/20 text-green-400"
                              : log.status === "error"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                          }`}
                        >
                          {log.status === "success"
                            ? "成功"
                            : log.status === "error"
                            ? "エラー"
                            : "実行中"}
                        </span>
                      </td>
                      <td className="p-4 text-gray-300 text-right">
                        {log.rows_processed}
                      </td>
                      <td className="p-4 text-gray-300 text-right">{log.rows_updated}</td>
                      <td className="p-4 text-right">
                        {log.rows_unmatched > 0 ? (
                          <span className="text-yellow-400">{log.rows_unmatched}</span>
                        ) : (
                          <span className="text-gray-500">0</span>
                        )}
                      </td>
                      <td className="p-4 text-red-400 text-xs truncate max-w-xs">
                        {log.error_message || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
