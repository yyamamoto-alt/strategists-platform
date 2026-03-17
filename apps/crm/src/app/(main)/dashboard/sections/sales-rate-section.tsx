import { createServiceClient } from "@/lib/supabase/server";
import { SalesRateClient } from "./sales-rate-client";

export interface SalesReportRow {
  date: string;        // 実施日 "2026/03/14"
  salesPerson: string; // 営業担当者名
  result: string;      // 結果
  attribute: string;   // 属性 "既卒・中途" / "27卒" etc.
}

/** 営業報告フォームから生データ取得 */
async function fetchSalesReports(): Promise<SalesReportRow[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("application_history")
    .select("raw_data")
    .eq("source", "営業報告") as { data: { raw_data: Record<string, string> }[] | null; error: { message: string } | null };

  if (error || !data) {
    console.error("Sales reports fetch error:", error?.message);
    return [];
  }

  // 表記ゆれ統一マップ
  const nameNormalize: Record<string, string> = {
    "木村遼": "木村",
    "田中（対象外）": "田中",
    "草留悠斗": "草留",
  };

  // 分母除外ステージ
  const EXCLUDED_RESULTS = new Set([
    "NoShow", "キャンセル", "直前キャンセル", "追加指導(NoShow)",
  ]);

  const rows: SalesReportRow[] = [];

  for (const row of data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rd = row.raw_data as any;
    if (!rd) continue;

    const sp = rd["営業担当者名"];
    const result = rd["結果"];
    const date = rd["実施日"];
    const attr = rd["属性"];

    if (!sp || !result || !date) continue;

    // 分母除外
    if (EXCLUDED_RESULTS.has(result)) continue;

    // 追加指導は分母から除外（結果未確定）
    if (result === "追加指導") continue;

    const normalizedName = nameNormalize[sp] || sp;
    if (!normalizedName || normalizedName === "") continue;

    rows.push({
      date,
      salesPerson: normalizedName,
      result,
      attribute: attr || "不明",
    });
  }

  return rows;
}

export async function SalesRateSection() {
  const reports = await fetchSalesReports();

  if (reports.length === 0) return null;

  return <SalesRateClient reports={reports} />;
}
