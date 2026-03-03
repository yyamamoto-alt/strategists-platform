"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from "@/components/spreadsheet-table";
import type { FormRecord } from "./page";

// フォームタブ定義: source名 → 表示名 + 表示したいraw_dataキー
const FORM_TABS: {
  source: string;
  label: string;
  columns: { key: string; label: string; width: number }[];
}[] = [
  {
    source: "メンター指導報告",
    label: "指導報告",
    columns: [
      { key: "指導日", label: "指導日", width: 110 },
      { key: "メンター名", label: "メンター", width: 100 },
      { key: "回次（合計指導回数）", label: "回次", width: 70 },
      { key: "解いた問題", label: "解いた問題", width: 200 },
      { key: "よかった点・成長した点", label: "よかった点", width: 250 },
      { key: "課題・改善点", label: "課題・改善点", width: 250 },
    ],
  },
  {
    source: "営業報告",
    label: "営業報告",
    columns: [
      { key: "実施日", label: "実施日", width: 110 },
      { key: "営業担当者名", label: "営業担当", width: 100 },
      { key: "お客様の名前", label: "お客様名", width: 120 },
      { key: "結果", label: "結果", width: 120 },
      { key: "入会確度", label: "入会確度", width: 80 },
      { key: "購入希望/検討しているプラン", label: "検討プラン", width: 200 },
      { key: "フィードバック内容(簡単にでok)", label: "フィードバック", width: 250 },
      { key: "ネックになりそうな要素（複数選択可）", label: "ネック要素", width: 200 },
    ],
  },
  {
    source: "課題提出",
    label: "課題提出",
    columns: [
      { key: "タイムスタンプ", label: "提出日時", width: 150 },
      { key: "問題タイプ", label: "問題タイプ", width: 110 },
      { key: "解いた問題", label: "解いた問題", width: 200 },
      { key: "担当メンター", label: "メンター", width: 100 },
      { key: "思考時間", label: "思考時間", width: 80 },
      { key: "施策仮説(結論)", label: "施策仮説", width: 250 },
      { key: "前回メンタリングの満足度", label: "満足度", width: 80 },
    ],
  },
  {
    source: "入塾フォーム",
    label: "入塾フォーム",
    columns: [
      { key: "タイムスタンプ", label: "申込日時", width: 150 },
      { key: "お名前", label: "お名前", width: 120 },
      { key: "申込プラン", label: "申込プラン", width: 200 },
      { key: "エージェント利用", label: "エージェント利用", width: 120 },
      { key: "Strategistsへの入会理由、（他社と比較した方）Strategistsを選んだ理由", label: "入会理由", width: 300 },
    ],
  },
  {
    source: "指導終了報告",
    label: "指導終了報告",
    columns: [
      { key: "タイムスタンプ", label: "報告日", width: 150 },
      { key: "担当メンター名", label: "メンター", width: 100 },
      { key: "受験予定企業", label: "受験予定企業", width: 200 },
      { key: "戦コンへの内定確度", label: "戦コン内定確度", width: 120 },
      { key: "大手総コン（BIg4・アクセンチュア）への内定確度", label: "総コン内定確度", width: 120 },
      { key: "追加指導のご提案", label: "追加指導", width: 150 },
      { key: "指導期間を通じたレベルアップ幅", label: "レベルアップ幅", width: 200 },
    ],
  },
  {
    source: "面接終了後報告",
    label: "面接終了後報告",
    columns: [
      { key: "タイムスタンプ", label: "報告日", width: 150 },
      { key: "受験企業", label: "受験企業", width: 150 },
      { key: "選考ステップ", label: "選考ステップ", width: 120 },
      { key: "面接内容", label: "面接内容", width: 250 },
      { key: "ケース面接で出題された問題", label: "ケース問題", width: 250 },
    ],
  },
];

interface FormDataClientProps {
  records: FormRecord[];
}

export function FormDataClient({ records }: FormDataClientProps) {
  const [activeTab, setActiveTab] = useState(FORM_TABS[0].source);

  const activeConfig = FORM_TABS.find((t) => t.source === activeTab)!;

  // タブ別件数
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of records) {
      counts[r.source] = (counts[r.source] || 0) + 1;
    }
    return counts;
  }, [records]);

  // アクティブタブのレコードをフィルタ
  const filteredRecords = useMemo(
    () => records.filter((r) => r.source === activeTab),
    [records, activeTab]
  );

  // 動的カラム定義
  const columns: SpreadsheetColumn<FormRecord>[] = useMemo(() => {
    const cols: SpreadsheetColumn<FormRecord>[] = [
      {
        key: "customer_name",
        label: "顧客名",
        width: 130,
        render: (r) =>
          r.customer_id && r.customer_name ? (
            <Link
              href={`/customers/${r.customer_id}`}
              className="text-brand hover:underline"
            >
              {r.customer_name}
            </Link>
          ) : (
            <span className="text-gray-500">-</span>
          ),
        sortValue: (r) => r.customer_name || "",
      },
    ];

    for (const col of activeConfig.columns) {
      cols.push({
        key: col.key,
        label: col.label,
        width: col.width,
        render: (r) => {
          const val = r.raw_data[col.key];
          if (!val) return <span className="text-gray-600">-</span>;
          const str = String(val);
          return (
            <span className="text-xs" title={str}>
              {str.length > 50 ? str.substring(0, 50) + "..." : str}
            </span>
          );
        },
        sortValue: (r) => r.raw_data[col.key] || "",
      });
    }

    return cols;
  }, [activeConfig]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">フォームデータ</h1>
        <p className="text-sm text-gray-500 mt-1">
          Google Formsから取り込んだ全フォームデータベース（{records.length.toLocaleString()}件）
        </p>
      </div>

      {/* タブ */}
      <div className="flex flex-wrap gap-2">
        {FORM_TABS.map((tab) => {
          const count = tabCounts[tab.source] || 0;
          const isActive = activeTab === tab.source;
          return (
            <button
              key={tab.source}
              onClick={() => setActiveTab(tab.source)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand text-white"
                  : "bg-surface-card border border-white/10 text-gray-300 hover:border-white/30"
              }`}
            >
              {tab.label}
              <span className={`ml-2 text-xs ${isActive ? "text-white/70" : "text-gray-500"}`}>
                {count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* テーブル */}
      <SpreadsheetTable
        columns={columns}
        data={filteredRecords}
        getRowKey={(r) => r.id}
        searchPlaceholder="顧客名・データ内容で検索..."
        searchFilter={(r, q) =>
          (r.customer_name?.toLowerCase().includes(q) ?? false) ||
          Object.values(r.raw_data).some((v) =>
            String(v).toLowerCase().includes(q)
          )
        }
        storageKey={`form-data-${activeTab}`}
      />
    </div>
  );
}
