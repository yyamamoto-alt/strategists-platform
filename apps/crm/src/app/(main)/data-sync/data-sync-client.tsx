"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
  { key: "application_date", label: "日付" },
];

function getUnmappedHeaders(conn: SpreadsheetConnection): string[] {
  const knownHeaders = conn.known_headers || [];
  if (knownHeaders.length === 0) return [];
  const mappedSheetCols = new Set(Object.values(conn.column_mapping || {}));
  return knownHeaders.filter((h) => h && !mappedSheetCols.has(h));
}

// ================================================================
// SyncLogRecord型
// ================================================================
interface SyncRecord {
  action: string;
  name: string | null;
  email: string | null;
  summary: Record<string, string>;
}

// ================================================================
// マッピング編集モーダル
// ================================================================
function MappingModal({
  conn,
  onClose,
  onSaved,
}: {
  conn: SpreadsheetConnection;
  onClose: () => void;
  onSaved: (updated: SpreadsheetConnection) => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({ ...conn.column_mapping });
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [headers, setHeaders] = useState<string[]>(conn.known_headers || []);
  const unmapped = useMemo(() => {
    const mapped = new Set(Object.values(fields));
    return headers.filter((h) => h && !mapped.has(h));
  }, [headers, fields]);

  const refreshHeaders = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/spreadsheets/${conn.id}/preview`);
      if (res.ok) {
        const data = await res.json();
        setHeaders(data.headers || []);
        // also save to DB
        await fetch(`/api/spreadsheets/${conn.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ known_headers: data.headers }),
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/spreadsheets/${conn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_mapping: fields }),
      });
      if (res.ok) {
        onSaved(await res.json());
      } else {
        alert("保存に失敗しました");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-card border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{conn.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">カラムマッピング編集 - {headers.length}列検出</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshHeaders}
              disabled={isRefreshing}
              className="px-3 py-1.5 text-xs text-gray-300 border border-white/10 rounded-lg hover:bg-white/5 disabled:opacity-50"
            >
              {isRefreshing ? "取得中..." : "ヘッダー再取得"}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-2">&times;</button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* 未マッピング列のハイライト */}
          {unmapped.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
              <p className="text-sm text-yellow-300 font-medium mb-2">
                未マッピング列 ({unmapped.length}件)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unmapped.map((h) => (
                  <span key={h} className="px-2.5 py-1 bg-yellow-500/20 text-yellow-300 rounded-lg text-xs font-medium">
                    {h}
                  </span>
                ))}
              </div>
              <p className="text-xs text-yellow-400/60 mt-2">
                下のドロップダウンで、これらの列をCRMフィールドに割り当てられます
              </p>
            </div>
          )}

          {/* マッピング設定 */}
          <div className="space-y-2">
            {CRM_FIELDS.map((field) => {
              const currentValue = fields[field.key] || "";
              const isNewlyMapped = currentValue && unmapped.includes(currentValue);
              return (
                <div
                  key={field.key}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
                    isNewlyMapped
                      ? "bg-yellow-500/10 border border-yellow-500/20"
                      : "bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <span className="text-sm text-gray-300 w-36 shrink-0 font-medium">
                    {field.label}
                  </span>
                  <select
                    value={currentValue}
                    onChange={(e) => {
                      setFields((prev) => {
                        if (!e.target.value) {
                          const next = { ...prev };
                          delete next[field.key];
                          return next;
                        }
                        return { ...prev, [field.key]: e.target.value };
                      });
                    }}
                    className="flex-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-brand appearance-none"
                  >
                    <option value="">-- 未設定 --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}{unmapped.includes(h) ? " (NEW)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 text-sm text-gray-400 hover:text-white">
            キャンセル
          </button>
          <button
            onClick={save}
            disabled={isSaving}
            className="px-6 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50"
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// 同期ログ詳細モーダル
// ================================================================
function LogDetailModal({
  log,
  connectionName,
  onClose,
}: {
  log: SyncLog;
  connectionName: string;
  onClose: () => void;
}) {
  const records: SyncRecord[] = (log.details as { records?: SyncRecord[] })?.records || [];
  const actionLabel = (a: string) => {
    if (a === "created") return { text: "新規", cls: "bg-green-500/20 text-green-400" };
    if (a === "updated") return { text: "更新", cls: "bg-blue-500/20 text-blue-400" };
    if (a === "unmatched") return { text: "未マッチ", cls: "bg-yellow-500/20 text-yellow-400" };
    return { text: a, cls: "bg-gray-500/20 text-gray-400" };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-card border border-white/10 rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">同期ログ詳細</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {connectionName} - {formatDate(log.started_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-2">&times;</button>
        </div>

        {/* サマリーカード */}
        <div className="px-6 py-4 grid grid-cols-4 gap-3">
          {[
            { label: "処理行数", value: log.rows_processed, color: "text-white" },
            { label: "新規作成", value: log.rows_created, color: "text-green-400" },
            { label: "更新", value: log.rows_updated, color: "text-blue-400" },
            { label: "未マッチ", value: log.rows_unmatched, color: "text-yellow-400" },
          ].map((item) => (
            <div key={item.label} className="bg-white/5 rounded-xl px-4 py-3 text-center">
              <p className="text-[11px] text-gray-500">{item.label}</p>
              <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* レコード一覧 */}
        <div className="px-6 pb-6">
          {records.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              レコード詳細データがありません（この同期より前のログには詳細が記録されていません）
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500 mb-2">{records.length}件のレコード</p>
              {records.map((r, i) => {
                const { text, cls } = actionLabel(r.action);
                return (
                  <div key={i} className="flex items-start gap-3 bg-white/[0.03] rounded-lg px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 mt-0.5 ${cls}`}>
                      {text}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {r.name && <span className="text-sm text-white font-medium">{r.name}</span>}
                        {r.email && <span className="text-xs text-gray-500">{r.email}</span>}
                        {!r.name && !r.email && <span className="text-xs text-gray-500">名前/メール不明</span>}
                      </div>
                      {Object.keys(r.summary).length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                          {Object.entries(r.summary).map(([k, v]) => (
                            <span key={k} className="text-[11px] text-gray-500">
                              <span className="text-gray-600">{k}:</span> {String(v).substring(0, 60)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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

  // マッピングUI（新規追加用）
  const [mappingFields, setMappingFields] = useState<Record<string, string>>({});

  // 同期中
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // マッピング編集モーダル
  const [editingConn, setEditingConn] = useState<SpreadsheetConnection | null>(null);

  // ログ詳細モーダル
  const [viewingLog, setViewingLog] = useState<SyncLog | null>(null);

  // 顧客検索（未マッチ紐付け用）
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string | null; attribute: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);

  // ヘッダー一括更新
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "connections", label: "接続一覧" },
    { key: "unmatched", label: "未マッチレコード", count: unmatched.length },
    { key: "logs", label: "同期ログ" },
  ];

  // 未マッピング列の合計
  const totalUnmapped = connections.reduce(
    (sum, conn) => sum + getUnmappedHeaders(conn).length,
    0
  );

  // 接続名マップ（ログ表示用）
  const connNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of connections) m[c.id] = c.name;
    return m;
  }, [connections]);

  // ================================================================
  // ヘッダー一括更新
  // ================================================================

  const refreshAllHeaders = useCallback(async () => {
    setIsRefreshingAll(true);
    try {
      for (const conn of connections) {
        try {
          const res = await fetch(`/api/spreadsheets/${conn.id}/preview`);
          if (res.ok) {
            const data = await res.json();
            const patchRes = await fetch(`/api/spreadsheets/${conn.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ known_headers: data.headers }),
            });
            if (patchRes.ok) {
              const updated = await patchRes.json();
              setConnections((prev) => prev.map((c) => (c.id === conn.id ? updated : c)));
            }
          }
        } catch {
          // skip individual errors
        }
      }
    } finally {
      setIsRefreshingAll(false);
    }
  }, [connections]);

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
  // マッピングフィールド更新（新規追加用）
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
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-yellow-300 font-medium">
                {connections.filter((c) => getUnmappedHeaders(c).length > 0).length}件の接続で新しい列が検出されました
              </p>
              <p className="text-xs text-yellow-400/70 mt-1">
                Googleフォームに新しい項目が追加された可能性があります。各接続の「マッピング」ボタンから設定してください。
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {connections
                  .filter((c) => getUnmappedHeaders(c).length > 0)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setEditingConn(c)}
                      className="px-3 py-1.5 bg-yellow-500/20 text-yellow-300 rounded-lg text-xs font-medium hover:bg-yellow-500/30 transition-colors"
                    >
                      {c.name} (+{getUnmappedHeaders(c).length})
                    </button>
                  ))}
              </div>
            </div>
          </div>
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
              onClick={refreshAllHeaders}
              disabled={isRefreshingAll}
              className="px-4 py-2 border border-white/10 text-gray-300 rounded-lg text-sm font-medium hover:bg-white/5 disabled:opacity-50 transition-colors"
            >
              {isRefreshingAll ? "更新中..." : "全接続のヘッダー更新"}
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
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-24 shrink-0">接続名</span>
                    <span className="text-white font-medium">{previewTitle}</span>
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                      接続OK
                    </span>
                  </div>

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

          {/* 接続一覧カード */}
          {connections.length === 0 && !showAddForm ? (
            <div className="bg-surface-card rounded-xl border border-white/10 p-12 text-center">
              <p className="text-gray-400 mb-1">接続がありません</p>
              <p className="text-xs text-gray-500">
                「+ 接続追加」からGoogle Spreadsheetを接続してください
              </p>
            </div>
          ) : connections.length > 0 ? (
            <div className="space-y-2">
              {connections.map((conn) => {
                const unmapped = getUnmappedHeaders(conn);
                return (
                  <div
                    key={conn.id}
                    className={`bg-surface-card rounded-xl border p-4 ${
                      unmapped.length > 0
                        ? "border-yellow-500/30"
                        : "border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* 名前 + バッジ */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium truncate">{conn.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              conn.sync_mode === "append"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-purple-500/20 text-purple-400"
                            }`}
                          >
                            {conn.sync_mode === "append" ? "差分" : "全件"}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              conn.is_active
                                ? "bg-green-500/20 text-green-400"
                                : "bg-gray-500/20 text-gray-400"
                            }`}
                          >
                            {conn.is_active ? "有効" : "無効"}
                          </span>
                          {unmapped.length > 0 && (
                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px] font-medium">
                              新規{unmapped.length}列
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span>シート: {conn.sheet_name}</span>
                          <span>最終同期: {formatDate(conn.last_synced_at)}</span>
                          <span>{conn.last_synced_row}行</span>
                        </div>
                      </div>

                      {/* 操作ボタン */}
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setEditingConn(conn)}
                          className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                            unmapped.length > 0
                              ? "text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10"
                              : "text-gray-400 border-white/10 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          マッピング
                        </button>
                        <button
                          onClick={() => runSync(conn.id)}
                          disabled={syncingId === conn.id}
                          className="px-3 py-1.5 text-xs text-brand border border-brand/30 rounded-md hover:bg-brand/10 disabled:opacity-50 transition-colors"
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
                          className="px-3 py-1.5 text-xs text-red-400 border border-red-500/20 rounded-md hover:bg-red-500/10 transition-colors"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
            <div className="space-y-2">
              {syncLogs.map((log) => {
                const records: SyncRecord[] = (log.details as { records?: SyncRecord[] })?.records || [];
                const hasRecords = records.length > 0;
                return (
                  <div
                    key={log.id}
                    className="bg-surface-card rounded-xl border border-white/10 p-4 hover:border-white/20 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* ステータス */}
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 ${
                          log.status === "success"
                            ? "bg-green-500/20 text-green-400"
                            : log.status === "error"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {log.status === "success" ? "成功" : log.status === "error" ? "エラー" : "実行中"}
                      </span>

                      {/* 接続名 + 日時 */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white font-medium">
                          {connNameMap[log.connection_id] || "不明"}
                        </span>
                        <span className="text-xs text-gray-500 ml-3">
                          {formatDate(log.started_at)}
                        </span>
                      </div>

                      {/* 数値 */}
                      <div className="flex gap-4 text-xs shrink-0">
                        <span className="text-gray-400">{log.rows_processed}行</span>
                        {log.rows_created > 0 && (
                          <span className="text-green-400">+{log.rows_created}新規</span>
                        )}
                        {log.rows_updated > 0 && (
                          <span className="text-blue-400">{log.rows_updated}更新</span>
                        )}
                        {log.rows_unmatched > 0 && (
                          <span className="text-yellow-400">{log.rows_unmatched}未マッチ</span>
                        )}
                      </div>

                      {/* 詳細ボタン */}
                      {hasRecords && (
                        <button
                          onClick={() => setViewingLog(log)}
                          className="px-3 py-1.5 text-xs text-brand border border-brand/30 rounded-md hover:bg-brand/10 transition-colors shrink-0"
                        >
                          詳細
                        </button>
                      )}
                    </div>

                    {/* エラーメッセージ */}
                    {log.error_message && (
                      <p className="mt-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                        {log.error_message}
                      </p>
                    )}

                    {/* レコードプレビュー（最大3件） */}
                    {hasRecords && (
                      <div className="mt-3 space-y-1">
                        {records.slice(0, 3).map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                r.action === "created"
                                  ? "bg-green-500/20 text-green-400"
                                  : r.action === "updated"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-yellow-500/20 text-yellow-400"
                              }`}
                            >
                              {r.action === "created" ? "新規" : r.action === "updated" ? "更新" : "未マッチ"}
                            </span>
                            <span className="text-gray-300">{r.name || r.email || "不明"}</span>
                            {r.name && r.email && <span className="text-gray-600">{r.email}</span>}
                          </div>
                        ))}
                        {records.length > 3 && (
                          <button
                            onClick={() => setViewingLog(log)}
                            className="text-xs text-brand hover:underline"
                          >
                            ...他 {records.length - 3}件を表示
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* マッピング編集モーダル */}
      {editingConn && (
        <MappingModal
          conn={editingConn}
          onClose={() => setEditingConn(null)}
          onSaved={(updated) => {
            setConnections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setEditingConn(null);
          }}
        />
      )}

      {/* ログ詳細モーダル */}
      {viewingLog && (
        <LogDetailModal
          log={viewingLog}
          connectionName={connNameMap[viewingLog.connection_id] || "不明"}
          onClose={() => setViewingLog(null)}
        />
      )}
    </div>
  );
}
