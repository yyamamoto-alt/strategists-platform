"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export type ColumnCategory = "marketing" | "sales" | "education" | "agent" | "base";

export interface SpreadsheetColumn<T> {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "right" | "center";
  render: (item: T) => React.ReactNode;
  sortValue?: (item: T) => string | number;
  /** カラムフィルタ用: ユニーク値を文字列で返す関数 */
  filterValue?: (item: T) => string;
  computed?: boolean;
  formula?: string;
  category?: ColumnCategory;
  /** true = 複数行表示を許可（営業内容など長文カラム） */
  multiline?: boolean;
  /** sticky列の左端からの固定位置（px）。undefinedなら固定しない */
  stickyLeft?: number;
}

interface SpreadsheetTableProps<T> {
  columns: SpreadsheetColumn<T>[];
  data: T[];
  getRowKey: (item: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (item: T, query: string) => boolean;
  storageKey?: string;
  initialSearch?: string;
  onSearchChange?: (query: string) => void;
  /** 初期表示件数（無限スクロール用） */
  pageSize?: number;
}

// カテゴリ別のヘッダーとセルの色
const CATEGORY_HEADER_COLORS: Record<ColumnCategory, string> = {
  marketing: "bg-orange-500/10",
  sales: "bg-blue-500/10",
  education: "bg-green-500/10",
  agent: "bg-purple-500/10",
  base: "",
};

const CATEGORY_CELL_COLORS: Record<ColumnCategory, string> = {
  marketing: "bg-orange-500/[0.03]",
  sales: "bg-blue-500/[0.03]",
  education: "bg-green-500/[0.03]",
  agent: "bg-purple-500/[0.03]",
  base: "",
};

const CATEGORY_HEADER_TEXT: Record<ColumnCategory, string> = {
  marketing: "text-orange-400/80",
  sales: "text-blue-400/80",
  education: "text-green-400/80",
  agent: "text-purple-400/80",
  base: "text-gray-500",
};

function loadColumnWidths(key: string): Record<string, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`ss-w-${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveColumnWidths(key: string, widths: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`ss-w-${key}`, JSON.stringify(widths));
  } catch {
    // ignore
  }
}

function FormulaTooltip({ formula }: { formula: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-0.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-3.5 h-3.5 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-bold inline-flex items-center justify-center hover:bg-amber-500/40 transition-colors"
        title={formula}
      >
        f
      </button>
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 bg-gray-900 border border-white/20 rounded-lg px-3 py-2 text-xs text-gray-200 shadow-xl whitespace-pre-wrap min-w-[200px] max-w-[320px]">
          <div className="text-[10px] text-amber-400 font-semibold mb-1">計算式</div>
          {formula}
        </div>
      )}
    </span>
  );
}

// カラムフィルタドロップダウン
function ColumnFilter<T>({
  column,
  data,
  value,
  onChange,
}: {
  column: SpreadsheetColumn<T>;
  data: T[];
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const fn = column.filterValue;
    if (!fn) return [];
    const vals = new Set<string>();
    for (const item of data) {
      const v = fn(item);
      if (v && v !== "-") vals.add(v);
    }
    return Array.from(vals).sort();
  }, [column, data]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (options.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-flex items-center ml-0.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={cn(
          "w-3 h-3 inline-flex items-center justify-center rounded transition-colors",
          value ? "text-brand bg-brand/20" : "text-gray-500 hover:text-gray-300"
        )}
        title="フィルタ"
      >
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 16 16">
          <path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .37.83L9.5 7.67V14a.5.5 0 0 1-.74.44l-3-1.5A.5.5 0 0 1 5.5 12.5V7.67L.63 1.83A.5.5 0 0 1 1.5 1.5z"/>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-white/20 rounded-lg shadow-xl min-w-[140px] max-h-[240px] overflow-y-auto">
          <button
            onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors",
              !value ? "text-brand font-medium" : "text-gray-300"
            )}
          >
            すべて
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              onClick={(e) => { e.stopPropagation(); onChange(opt); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors truncate",
                value === opt ? "text-brand font-medium" : "text-gray-300"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 固定行高さ（2テーブル間の行揃え用） */
const ROW_H = 26;
const HEADER_H = 30;

export function SpreadsheetTable<T>({
  columns,
  data,
  getRowKey,
  searchPlaceholder = "検索...",
  searchFilter,
  storageKey = "default",
  initialSearch = "",
  onSearchChange,
  pageSize = 100,
}: SpreadsheetTableProps<T>) {
  const [search, setSearch] = useState(initialSearch);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => {
      const saved = loadColumnWidths(storageKey);
      if (saved) return saved;
      const defaults: Record<string, number> = {};
      for (const col of columns) {
        defaults[col.key] = col.width || 120;
      }
      return defaults;
    }
  );

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveColumnWidths(storageKey, columnWidths);
    }, 300);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [columnWidths, storageKey]);

  const resizeRef = useRef<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.preventDefault();
      e.stopPropagation();
      const startWidth = columnWidths[key] || 120;
      resizeRef.current = { key, startX: e.clientX, startWidth };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const { key: colKey, startX, startWidth: sw } = resizeRef.current;
        const diff = ev.clientX - startX;
        const newWidth = Math.max(40, sw + diff);
        setColumnWidths((prev) => ({ ...prev, [colKey]: newWidth }));
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [columnWidths]
  );

  const activeFilterCount = useMemo(
    () => Object.values(columnFilters).filter(Boolean).length,
    [columnFilters]
  );

  const handleColumnFilter = useCallback((key: string, val: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (val) next[key] = val;
      else delete next[key];
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setColumnFilters({});
    setSearch("");
  }, []);

  const filtered = useMemo(() => {
    let result = [...data];

    if (search && searchFilter) {
      const q = search.toLowerCase();
      result = result.filter((item) => searchFilter(item, q));
    }

    // カラムフィルタ適用
    for (const [key, filterVal] of Object.entries(columnFilters)) {
      if (!filterVal) continue;
      const col = columns.find((c) => c.key === key);
      if (col?.filterValue) {
        const fn = col.filterValue;
        result = result.filter((item) => fn(item) === filterVal);
      }
    }

    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        const sv = col.sortValue;
        result.sort((a, b) => {
          const aVal = sv(a);
          const bVal = sv(b);
          if (aVal === bVal) return 0;
          const cmp = aVal > bVal ? 1 : -1;
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [data, search, searchFilter, sortKey, sortDir, columns, columnFilters]);

  // 仮想化: 表示行のみレンダリング
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
    // SSR/初期レンダリング時に高さ0で行が表示されない問題を回避
    initialRect: { width: 800, height: 600 },
  });

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        // asc → desc → none
        if (sortDir === "asc") {
          setSortDir("desc");
          return prev;
        } else {
          setSortDir("asc");
          return null; // reset
        }
      }
      setSortDir("asc");
      return key;
    });
  }, [sortDir]);

  const getColWidth = useCallback(
    (col: SpreadsheetColumn<T>) => columnWidths[col.key] || col.width || 120,
    [columnWidths]
  );

  // 固定列と可変列を分離
  const frozenCols = useMemo(
    () => columns.filter((col) => col.stickyLeft !== undefined),
    [columns]
  );
  const scrollCols = useMemo(
    () => columns.filter((col) => col.stickyLeft === undefined),
    [columns]
  );
  const frozenWidth = useMemo(
    () => frozenCols.reduce((sum, col) => sum + getColWidth(col), 0),
    [frozenCols, getColWidth]
  );
  const hasFrozen = frozenCols.length > 0;

  // ヘッダーセル描画
  const renderTh = useCallback(
    (col: SpreadsheetColumn<T>, inFrozen: boolean) => {
      const cat = col.category || "base";
      return (
        <th
          key={col.key}
          className={cn(
            "py-1.5 px-2 text-[11px] font-semibold whitespace-nowrap select-none relative",
            col.computed
              ? "text-amber-400/80 border-b-2 border-amber-500/40"
              : CATEGORY_HEADER_TEXT[cat],
            CATEGORY_HEADER_COLORS[cat],
            inFrozen ? "bg-surface-elevated" : "",
            col.align === "right" ? "text-right" : "text-left",
          )}
          style={{
            width: getColWidth(col),
            minWidth: 40,
            maxWidth: getColWidth(col),
            height: HEADER_H,
          }}
        >
          <span className="inline-flex items-center gap-0.5 overflow-hidden">
            {col.label}
            {col.computed && col.formula && <FormulaTooltip formula={col.formula} />}
          </span>
          <div
            onMouseDown={(e) => handleResizeStart(e, col.key)}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand/50 active:bg-brand/70 transition-colors"
          />
        </th>
      );
    },
    [getColWidth, handleResizeStart]
  );

  // ボディセル描画
  const renderTd = useCallback(
    (col: SpreadsheetColumn<T>, item: T, rowIdx: number, inFrozen: boolean) => {
      const cat = col.category || "base";
      return (
        <td
          key={col.key}
          className={cn(
            "py-0.5 px-2 text-xs overflow-hidden whitespace-nowrap text-ellipsis",
            col.align === "right"
              ? "text-right"
              : col.align === "center"
                ? "text-center"
                : "text-left",
            inFrozen
              ? "font-medium text-white bg-surface-card"
              : cn("text-gray-300", CATEGORY_CELL_COLORS[cat])
          )}
          style={{
            width: getColWidth(col),
            maxWidth: getColWidth(col),
            height: ROW_H,
          }}
        >
          {col.render(item)}
        </td>
      );
    },
    [getColWidth]
  );

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {searchFilter && (
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); onSearchChange?.(e.target.value); }}
            className="flex-1 max-w-xs px-2 py-1 bg-surface-elevated border border-white/10 text-white placeholder-gray-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand"
          />
        )}
        <span className="text-xs text-gray-500">{filtered.length}件</span>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="px-2 py-0.5 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded hover:bg-amber-500/20 transition-colors"
          >
            フィルタ解除 ({activeFilterCount})
          </button>
        )}
      </div>
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
        <div ref={scrollContainerRef} className="overflow-auto max-h-[calc(100vh-180px)]">
          <div className="flex" style={{ minWidth: "max-content" }}>
            {/* ═══ 固定列ペイン ═══ */}
            {hasFrozen && (
              <div
                className="sticky left-0 z-20 flex-shrink-0 bg-surface-card"
                style={{ width: frozenWidth, boxShadow: "3px 0 6px rgba(0,0,0,0.4)" }}
              >
                <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                  <thead className="bg-surface-elevated border-b border-white/10 sticky top-0 z-30">
                    <tr>
                      {frozenCols.map((col) => renderTh(col, true))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={frozenCols.length} className="py-8 text-center text-gray-500 text-sm">
                          &nbsp;
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={frozenCols.length} style={{ padding: 0, height: totalHeight, position: "relative" }}>
                          {virtualItems.map((virtualRow) => {
                            const item = filtered[virtualRow.index];
                            const rowIdx = virtualRow.index;
                            return (
                              <div
                                key={getRowKey(item)}
                                className={cn(
                                  "border-b border-white/[0.06] hover:bg-white/5 transition-colors flex",
                                  rowIdx % 2 === 1 && "bg-white/[0.015]"
                                )}
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  width: "100%",
                                  height: ROW_H,
                                  transform: `translateY(${virtualRow.start}px)`,
                                }}
                              >
                                {frozenCols.map((col) => {
                                  const cat = col.category || "base";
                                  return (
                                    <div
                                      key={col.key}
                                      className={cn(
                                        "py-0.5 px-2 text-xs overflow-hidden whitespace-nowrap text-ellipsis flex-shrink-0",
                                        col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                                        "font-medium text-white bg-surface-card"
                                      )}
                                      style={{
                                        width: getColWidth(col),
                                        maxWidth: getColWidth(col),
                                        height: ROW_H,
                                        lineHeight: `${ROW_H}px`,
                                      }}
                                    >
                                      {col.render(item)}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ═══ 可変列ペイン ═══ */}
            <div className="flex-shrink-0">
              <table className="border-collapse" style={{ tableLayout: "fixed" }}>
                <thead className="bg-surface-elevated border-b border-white/10 sticky top-0 z-20">
                  <tr>
                    {scrollCols.map((col) => renderTh(col, false))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={scrollCols.length} className="py-8 text-center text-gray-500 text-sm">
                        データがありません
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={scrollCols.length} style={{ padding: 0, height: totalHeight, position: "relative" }}>
                        {virtualItems.map((virtualRow) => {
                          const item = filtered[virtualRow.index];
                          const rowIdx = virtualRow.index;
                          return (
                            <div
                              key={getRowKey(item)}
                              className={cn(
                                "border-b border-white/[0.06] hover:bg-white/5 transition-colors flex",
                                rowIdx % 2 === 1 && "bg-white/[0.015]"
                              )}
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: ROW_H,
                                transform: `translateY(${virtualRow.start}px)`,
                              }}
                            >
                              {scrollCols.map((col) => {
                                const cat = col.category || "base";
                                return (
                                  <div
                                    key={col.key}
                                    className={cn(
                                      "py-0.5 px-2 text-xs overflow-hidden whitespace-nowrap text-ellipsis flex-shrink-0",
                                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                                      "text-gray-300",
                                      CATEGORY_CELL_COLORS[cat]
                                    )}
                                    style={{
                                      width: getColWidth(col),
                                      maxWidth: getColWidth(col),
                                      height: ROW_H,
                                      lineHeight: `${ROW_H}px`,
                                    }}
                                  >
                                    {col.render(item)}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
