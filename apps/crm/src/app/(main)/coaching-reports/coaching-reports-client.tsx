"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from "@/components/spreadsheet-table";
import type { CoachingReport } from "./page";

interface CoachingReportsClientProps {
  reports: CoachingReport[];
}

export function CoachingReportsClient({ reports }: CoachingReportsClientProps) {
  const [mentorFilter, setMentorFilter] = useState<string>("all");

  // メンター一覧を取得
  const mentors = useMemo(() => {
    const set = new Set<string>();
    for (const r of reports) {
      if (r.mentor_name) set.add(r.mentor_name);
    }
    return Array.from(set).sort();
  }, [reports]);

  // メンターフィルタ適用
  const filteredReports = useMemo(() => {
    if (mentorFilter === "all") return reports;
    return reports.filter((r) => r.mentor_name === mentorFilter);
  }, [reports, mentorFilter]);

  // KPI計算
  const kpis = useMemo(() => {
    const totalReports = reports.length;

    // キャンセル数
    const cancelCount = reports.filter(
      (r) => r.cancellation !== null && r.cancellation !== ""
    ).length;

    // ユニーク顧客数
    const uniqueEmails = new Set(reports.map((r) => r.email).filter(Boolean));

    // メンター別件数
    const mentorCounts: Record<string, number> = {};
    for (const r of reports) {
      if (r.mentor_name) {
        mentorCounts[r.mentor_name] = (mentorCounts[r.mentor_name] || 0) + 1;
      }
    }

    return {
      totalReports,
      cancelCount,
      cancelRate: totalReports > 0 ? cancelCount / totalReports : 0,
      uniqueStudents: uniqueEmails.size,
      mentorCounts,
    };
  }, [reports]);

  const columns: SpreadsheetColumn<CoachingReport>[] = useMemo(
    () => [
      {
        key: "coaching_date",
        label: "指導日",
        width: 110,
        render: (r) => formatDate(r.coaching_date),
        sortValue: (r) => r.coaching_date || "",
      },
      {
        key: "customer_name",
        label: "顧客名",
        width: 140,
        render: (r) =>
          r.customer_id && r.customer_name ? (
            <Link
              href={`/customers/${r.customer_id}`}
              className="text-brand hover:underline"
            >
              {r.customer_name}
            </Link>
          ) : (
            <span className="text-gray-500">{r.email || "-"}</span>
          ),
        sortValue: (r) => r.customer_name || r.email || "",
      },
      {
        key: "email",
        label: "メールアドレス",
        width: 220,
        render: (r) => (
          <span className="text-gray-400 text-xs">{r.email || "-"}</span>
        ),
        sortValue: (r) => r.email || "",
      },
      {
        key: "session_number",
        label: "回次",
        width: 70,
        align: "right" as const,
        render: (r) =>
          r.session_number !== null ? (
            <span className="font-mono">{r.session_number}</span>
          ) : (
            "-"
          ),
        sortValue: (r) => r.session_number || 0,
      },
      {
        key: "mentor_name",
        label: "メンター",
        width: 100,
        render: (r) => r.mentor_name || "-",
        sortValue: (r) => r.mentor_name || "",
      },
      {
        key: "cancellation",
        label: "キャンセル",
        width: 110,
        align: "center" as const,
        render: (r) =>
          r.cancellation ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/20 text-red-400">
              {r.cancellation}
            </span>
          ) : (
            <span className="text-gray-600">-</span>
          ),
        sortValue: (r) => (r.cancellation ? 1 : 0),
      },
      {
        key: "level_fermi",
        label: "フェルミ推定",
        width: 200,
        render: (r) => (
          <span className="text-xs" title={r.level_fermi || ""}>
            {r.level_fermi
              ? r.level_fermi.length > 30
                ? r.level_fermi.substring(0, 30) + "..."
                : r.level_fermi
              : "-"}
          </span>
        ),
      },
      {
        key: "level_case",
        label: "ケース面接",
        width: 200,
        render: (r) => (
          <span className="text-xs" title={r.level_case || ""}>
            {r.level_case
              ? r.level_case.length > 30
                ? r.level_case.substring(0, 30) + "..."
                : r.level_case
              : "-"}
          </span>
        ),
      },
      {
        key: "level_mck",
        label: "McK対策",
        width: 200,
        render: (r) => (
          <span className="text-xs" title={r.level_mck || ""}>
            {r.level_mck
              ? r.level_mck.length > 30
                ? r.level_mck.substring(0, 30) + "..."
                : r.level_mck
              : "-"}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">指導報告</h1>
        <p className="text-sm text-gray-500 mt-1">
          メンターの指導報告データベース
        </p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            総指導回数
          </p>
          <p className="text-2xl font-bold text-white mt-1">
            {kpis.totalReports.toLocaleString()}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            ユニーク受講生
          </p>
          <p className="text-2xl font-bold text-white mt-1">
            {kpis.uniqueStudents}
          </p>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            キャンセル数
          </p>
          <p
            className={`text-2xl font-bold mt-1 ${kpis.cancelCount > 0 ? "text-red-400" : "text-white"}`}
          >
            {kpis.cancelCount}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {(kpis.cancelRate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-surface-card rounded-xl border border-white/10 p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">
            メンター数
          </p>
          <p className="text-2xl font-bold text-white mt-1">{mentors.length}</p>
        </div>
      </div>

      {/* メンター別カード */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {Object.entries(kpis.mentorCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([mentor, count]) => (
            <button
              key={mentor}
              onClick={() =>
                setMentorFilter(mentorFilter === mentor ? "all" : mentor)
              }
              className={`rounded-lg border p-2 text-center transition-colors ${
                mentorFilter === mentor
                  ? "bg-brand border-brand text-white"
                  : "bg-surface-card border-white/10 text-gray-300 hover:border-white/30"
              }`}
            >
              <p className="text-xs font-medium">{mentor}</p>
              <p className="text-lg font-bold">{count}</p>
            </button>
          ))}
      </div>

      {/* フィルターリセット */}
      {mentorFilter !== "all" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">
            フィルター: {mentorFilter}
          </span>
          <button
            onClick={() => setMentorFilter("all")}
            className="text-xs text-brand hover:underline"
          >
            リセット
          </button>
        </div>
      )}

      {/* テーブル */}
      <SpreadsheetTable
        columns={columns}
        data={filteredReports}
        getRowKey={(r) => r.id}
        searchPlaceholder="名前・メール・メンターで検索..."
        searchFilter={(r, q) =>
          (r.customer_name?.toLowerCase().includes(q) ?? false) ||
          (r.email?.toLowerCase().includes(q) ?? false) ||
          (r.mentor_name?.toLowerCase().includes(q) ?? false)
        }
        storageKey="coaching-reports"
      />
    </div>
  );
}
