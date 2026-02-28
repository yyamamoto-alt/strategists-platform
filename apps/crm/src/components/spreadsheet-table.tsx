"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface SpreadsheetColumn<T> {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "right" | "center";
  render: (item: T) => React.ReactNode;
  sortValue?: (item: T) => string | number;
}

interface SpreadsheetTableProps<T> {
  columns: SpreadsheetColumn<T>[];
  data: T[];
  getRowKey: (item: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (item: T, query: string) => boolean;
}

export function SpreadsheetTable<T>({
  columns,
  data,
  getRowKey,
  searchPlaceholder = "検索...",
  searchFilter,
}: SpreadsheetTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-3 py-2 bg-surface-elevated border border-white/10 text-white placeholder-gray-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <span className="text-sm text-gray-500">{filtered.length}件</span>
      </div>

      <div className="bg-surface-card rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-max w-full">
            <thead className="bg-surface-elevated border-b border-white/10">
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={col.key}
                    onClick={
                      col.sortValue ? () => handleSort(col.key) : undefined
                    }
                    className={cn(
                      "py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap select-none",
                      col.align === "right" ? "text-right" : "text-left",
                      col.sortValue &&
                        "cursor-pointer hover:text-gray-300 transition-colors",
                      i === 0 && "sticky left-0 z-20 bg-surface-elevated"
                    )}
                    style={col.width ? { minWidth: col.width } : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key && (
                        <span className="text-brand">
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </span>
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
                        "py-2.5 px-3 text-sm whitespace-nowrap",
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left",
                        i === 0
                          ? "sticky left-0 z-10 bg-surface-card group-hover:bg-surface-elevated font-medium text-white transition-colors"
                          : "text-gray-300"
                      )}
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
