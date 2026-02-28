"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface SpreadsheetColumn<T> {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "right" | "center";
  render: (item: T) => React.ReactNode;
  sortValue?: (item: T) => string | number;
  /** true = 計算で算出される変数カラム、false/undefined = DBベタ打ち定数カラム */
  computed?: boolean;
  /** 変数カラムの場合、計算式の説明 */
  formula?: string;
}

interface SpreadsheetTableProps<T> {
  columns: SpreadsheetColumn<T>[];
  data: T[];
  getRowKey: (item: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (item: T, query: string) => boolean;
  storageKey?: string;
}

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

export function SpreadsheetTable<T>({
  columns,
  data,
  getRowKey,
  searchPlaceholder = "検索...",
  searchFilter,
  storageKey = "default",
}: SpreadsheetTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // カラム幅: localStorage から復元、なければデフォルト
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

  // 幅変更時にlocalStorageへ保存
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

  // リサイズハンドリング
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
        const { key: colKey, startX, startWidth } = resizeRef.current;
        const diff = ev.clientX - startX;
        const newWidth = Math.max(40, startWidth + diff);
        setColumnWidths((prev) => ({
          ...prev,
          [colKey]: newWidth,
        }));
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

  const filtered = useMemo(() => {
    let result = [...data];

    if (search && searchFilter) {
      const q = search.toLowerCase();
      result = result.filter((item) => searchFilter(item, q));
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
  }, [data, search, searchFilter, sortKey, sortDir, columns]);

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const getColWidth = useCallback(
    (col: SpreadsheetColumn<T>) => columnWidths[col.key] || col.width || 120,
    [columnWidths]
  );

  return (
    <div>
      {searchFilter && (
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-xs px-2 py-1 bg-surface-elevated border border-white/10 text-white placeholder-gray-500 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <span className="text-xs text-gray-500">{filtered.length}件</span>
        </div>
      )}
      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-180px)]">
          <table className="min-w-max w-full">
            <thead className="bg-surface-elevated border-b border-white/10 sticky top-0 z-30">
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={col.key}
                    onClick={
                      col.sortValue ? () => handleSort(col.key) : undefined
                    }
                    className={cn(
                      "py-2 px-2 text-[11px] font-semibold whitespace-nowrap select-none relative",
                      col.computed
                        ? "text-amber-400/80 border-b-2 border-amber-500/40"
                        : "text-gray-500",
                      col.align === "right" ? "text-right" : "text-left",
                      col.sortValue &&
                        "cursor-pointer hover:text-gray-300 transition-colors",
                      i === 0 && "sticky left-0 z-40 bg-surface-elevated"
                    )}
                    style={{
                      width: getColWidth(col),
                      minWidth: 40,
                      maxWidth: getColWidth(col),
                    }}
                  >
                    <span className="inline-flex items-center gap-0.5 overflow-hidden">
                      {col.label}
                      {col.computed && col.formula && (
                        <FormulaTooltip formula={col.formula} />
                      )}
                      {sortKey === col.key && (
                        <span className="text-brand">
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </span>
                    {/* リサイズハンドル */}
                    <div
                      onMouseDown={(e) => handleResizeStart(e, col.key)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand/50 active:bg-brand/70 transition-colors"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={getRowKey(item)}
                  className="border-b border-white/[0.08] hover:bg-white/5 transition-colors group"
                >
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn(
                        "py-1.5 px-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis",
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left",
                        i === 0
                          ? "sticky left-0 z-10 bg-surface-card group-hover:bg-surface-elevated font-medium text-white transition-colors"
                          : "text-gray-300"
                      )}
                      style={{
                        width: getColWidth(col),
                        maxWidth: getColWidth(col),
                      }}
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-8 text-center text-gray-500 text-sm"
                  >
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
