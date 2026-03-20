import { createServiceClient } from "@/lib/supabase/server";
import { createAuthClient } from "@/lib/supabase/auth-server";
import { SalesCostClient } from "./sales-cost-client";

export interface SalesCostReportRow {
  date: string;        // 実施日 "2026/03/14"
  salesPerson: string; // 営業担当者名
  attribute: string;   // 属性 "既卒・中途" / "27卒" etc.
  customerEmail: string; // 顧客メールアドレス
}

/** 営業報告フォームから生データ取得（コスト試算用） */
async function fetchSalesReportsForCost(): Promise<SalesCostReportRow[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("application_history")
    .select("raw_data")
    .eq("source", "営業報告") as { data: { raw_data: Record<string, string> }[] | null; error: { message: string } | null };

  if (error || !data) {
    console.error("Sales cost reports fetch error:", error?.message);
    return [];
  }

  // 表記ゆれ統一マップ
  const nameNormalize: Record<string, string> = {
    "木村遼": "木村",
    "田中（対象外）": "田中",
    "草留悠斗": "草留",
  };

  // コスト試算では NoShow・キャンセルも含める（面談セッション自体のコスト）
  // ただし結果が空のものは除外
  const EXCLUDED_RESULTS = new Set([
    "NoShow", "キャンセル", "直前キャンセル",
  ]);

  const rows: SalesCostReportRow[] = [];

  for (const row of data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rd = row.raw_data as any;
    if (!rd) continue;

    const sp = rd["営業担当者名"];
    const result = rd["結果"];
    const date = rd["実施日"];
    const attr = rd["属性"];
    const email = rd["顧客メールアドレス"];

    if (!sp || !result || !date) continue;

    // NoShow/キャンセルは実施されていないのでコスト対象外
    if (EXCLUDED_RESULTS.has(result)) continue;

    const normalizedName = nameNormalize[sp] || sp;
    if (!normalizedName || normalizedName === "") continue;

    rows.push({
      date,
      salesPerson: normalizedName,
      attribute: attr || "不明",
      customerEmail: email || "",
    });
  }

  return rows;
}

/** 顧客メール → チャネル のマップを取得 */
async function fetchEmailChannelMap(): Promise<Record<string, string>> {
  const supabase = createServiceClient();

  // customer_channel_attribution は customer_id ベース
  // customers テーブルと JOIN して email を取得
  const { data, error } = await supabase
    .from("customer_channel_attribution")
    .select("customer_id, marketing_channel, customers!inner(email)") as {
      data: { customer_id: string; marketing_channel: string; customers: { email: string } }[] | null;
      error: { message: string } | null;
    };

  if (error || !data) {
    console.error("Channel attribution fetch error:", error?.message);
    return {};
  }

  const map: Record<string, string> = {};
  for (const row of data) {
    const email = row.customers?.email;
    if (email && row.marketing_channel) {
      map[email.toLowerCase()] = row.marketing_channel;
    }
  }

  // customer_emails テーブルも確認（副メール対応）
  const { data: altEmails } = await supabase
    .from("customer_emails")
    .select("customer_id, email") as {
      data: { customer_id: string; email: string }[] | null;
    };

  if (altEmails) {
    // customer_id → channel のマップを作る
    const idToChannel: Record<string, string> = {};
    for (const row of data) {
      idToChannel[row.customer_id] = row.marketing_channel;
    }
    for (const alt of altEmails) {
      const channel = idToChannel[alt.customer_id];
      if (channel && alt.email) {
        map[alt.email.toLowerCase()] = channel;
      }
    }
  }

  return map;
}

export async function SalesCostSection() {
  // 管理者のみ表示
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (user) {
    const supabase = createServiceClient();
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single() as { data: { role: string } | null };
    if (roleData?.role !== "admin") return null;
  } else {
    return null;
  }

  const [reports, emailChannelMap] = await Promise.all([
    fetchSalesReportsForCost(),
    fetchEmailChannelMap(),
  ]);

  if (reports.length === 0) return null;

  return (
    <SalesCostClient
      reports={reports}
      emailChannelMap={emailChannelMap}
    />
  );
}
