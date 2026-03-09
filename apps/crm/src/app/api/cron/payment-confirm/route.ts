import { fetchSheetData } from "@/lib/google-sheets";
import {
  sendSlackDM,
  sendSlackMessage,
  getStaffSlackMapping,
  logNotification,
  isSystemAutomationEnabled,
} from "@/lib/slack";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 経営reportチャンネル */
const REPORT_CHANNEL = "C0951QVAJ5N";

/** 組織・コスト管理スプレッドシート */
const SPREADSHEET_ID = "1Kv2Sctxl_ZYRcaPSd9HjoYo2J6bu85OR1lPiDpo4HcY";
const SHEET_NAME = "支払い参照用";

/** 報酬カテゴリ（シートのカラム名と一致させる） */
const PAYMENT_CATEGORIES = [
  "稼働報酬",
  "営業報酬",
  "指導報酬",
  "臨時報酬",
  "経費",
] as const;

type PaymentBreakdown = {
  total: number;
  items: { category: string; amount: number }[];
};

/**
 * スプレッドシートからスタッフ別の支払い情報を解析する
 */
function parsePaymentSheet(
  rows: string[][]
): Map<string, PaymentBreakdown> {
  if (rows.length < 2) return new Map();

  const headers = rows[0];

  // 名前列を探す（最初の列 or "名前"/"氏名" を含む列）
  let nameColIdx = headers.findIndex(
    (h) => h === "名前" || h === "氏名" || h === "スタッフ名"
  );
  if (nameColIdx === -1) nameColIdx = 0;

  // 各報酬カテゴリの列インデックスを特定
  const categoryIndices: { category: string; colIdx: number }[] = [];
  for (const cat of PAYMENT_CATEGORIES) {
    const idx = headers.findIndex((h) => h.includes(cat));
    if (idx !== -1) {
      categoryIndices.push({ category: cat, colIdx: idx });
    }
  }

  const result = new Map<string, PaymentBreakdown>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = row[nameColIdx]?.trim();
    if (!name) continue;

    const items: { category: string; amount: number }[] = [];
    let total = 0;

    for (const { category, colIdx } of categoryIndices) {
      const rawValue = row[colIdx] || "";
      // カンマ、円記号、スペースを除去して数値に変換
      const cleaned = rawValue.replace(/[,，円¥\s]/g, "");
      const amount = cleaned ? parseInt(cleaned, 10) : 0;
      if (!isNaN(amount) && amount !== 0) {
        items.push({ category, amount });
        total += amount;
      }
    }

    // 合計列がシートにある場合はそちらを優先
    const totalColIdx = headers.findIndex(
      (h) => h === "合計" || h === "支払合計" || h === "総額"
    );
    if (totalColIdx !== -1 && row[totalColIdx]) {
      const cleaned = row[totalColIdx].replace(/[,，円¥\s]/g, "");
      const sheetTotal = parseInt(cleaned, 10);
      if (!isNaN(sheetTotal)) {
        total = sheetTotal;
      }
    }

    if (total > 0 || items.length > 0) {
      result.set(name, { total, items });
    }
  }

  return result;
}

/**
 * 金額をカンマ区切りフォーマット
 */
function formatYen(amount: number): string {
  return amount.toLocaleString("ja-JP");
}

/**
 * GET /api/cron/payment-confirm
 * 毎月14日: 報酬支払い確認
 * - 「組織・コスト管理」シートから個別の支払い情報を取得
 * - staff_slack_mapping に登録されたスタッフに個別DM送信
 * - 経営reportチャンネルにサマリー投稿
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isSystemAutomationEnabled("payment-confirm"))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const month = now.getMonth() + 1;
  const monthLabel = `${now.getFullYear()}年${month}月`;

  const mapping = await getStaffSlackMapping();
  const staffEntries = Object.entries(mapping);

  if (staffEntries.length === 0) {
    return NextResponse.json({
      ok: true,
      date: today,
      message: "staff_slack_mapping が未設定です",
      results: { staff_notified: 0 },
      timestamp: now.toISOString(),
    });
  }

  // スプレッドシートから支払い情報を取得
  let paymentData: Map<string, PaymentBreakdown> | null = null;
  let sheetError: string | null = null;

  try {
    const rows = await fetchSheetData(SPREADSHEET_ID, SHEET_NAME);
    paymentData = parsePaymentSheet(rows);
  } catch (e) {
    console.error("Failed to fetch payment sheet:", e);
    sheetError = e instanceof Error ? e.message : String(e);
  }

  const results = {
    staff_notified: 0,
    staff_skipped: 0,
    staff_failed: 0,
    sheet_available: paymentData !== null,
  };

  const notifiedNames: string[] = [];
  const skippedNames: string[] = [];
  const failedNames: string[] = [];
  const summaryAmounts: { name: string; total: number }[] = [];

  for (const [staffName, slackUserId] of staffEntries) {
    // スプレッドシートが読めた場合: 個別の支払い情報でDM
    if (paymentData) {
      const breakdown = paymentData.get(staffName);
      if (!breakdown) {
        // シートにこのスタッフの情報がない → スキップ
        skippedNames.push(staffName);
        results.staff_skipped++;
        continue;
      }

      const breakdownLines = breakdown.items.map(
        ({ category, amount }) => `- ${category}: ${formatYen(amount)}円`
      );

      const dmMessage = [
        `(自動送信)`,
        `【${month}月分の支払概要】`,
        `支払予定額: ${formatYen(breakdown.total)}円`,
        ...breakdownLines,
        `※自動計算システムが送付しています。万が一間違いがありましたら申し訳ございません。`,
      ].join("\n");

      try {
        await sendSlackDM(slackUserId, dmMessage);
        await logNotification({
          type: "payment_confirm",
          recipient: slackUserId,
          message: dmMessage,
          status: "success",
          metadata: {
            staff_name: staffName,
            month: monthLabel,
            total: breakdown.total,
          },
        });
        notifiedNames.push(staffName);
        summaryAmounts.push({ name: staffName, total: breakdown.total });
        results.staff_notified++;
      } catch (e) {
        console.error(
          `Failed to send payment confirm DM to ${staffName}:`,
          e
        );
        await logNotification({
          type: "payment_confirm",
          recipient: slackUserId,
          message: dmMessage,
          status: "failed",
          error_message: e instanceof Error ? e.message : String(e),
          metadata: { staff_name: staffName, month: monthLabel },
        });
        failedNames.push(staffName);
        results.staff_failed++;
      }
    } else {
      // フォールバック: シートが読めなかった場合は汎用メッセージ
      const dmMessage = [
        `💰 *${monthLabel}の報酬支払い確認*`,
        ``,
        `今月の報酬支払い確認をお願いします。`,
        `問題がある場合は経理までご連絡ください。`,
        ``,
        `確認期限: ${monthLabel}末日`,
      ].join("\n");

      try {
        await sendSlackDM(slackUserId, dmMessage);
        await logNotification({
          type: "payment_confirm",
          recipient: slackUserId,
          message: dmMessage,
          status: "success",
          metadata: {
            staff_name: staffName,
            month: monthLabel,
            fallback: true,
          },
        });
        notifiedNames.push(staffName);
        results.staff_notified++;
      } catch (e) {
        console.error(
          `Failed to send payment confirm DM to ${staffName}:`,
          e
        );
        await logNotification({
          type: "payment_confirm",
          recipient: slackUserId,
          message: dmMessage,
          status: "failed",
          error_message: e instanceof Error ? e.message : String(e),
          metadata: { staff_name: staffName, month: monthLabel },
        });
        failedNames.push(staffName);
        results.staff_failed++;
      }
    }
  }

  // 経営reportチャンネルにサマリー投稿
  const summaryLines = [
    `💰 *${monthLabel} 報酬支払い確認 送信完了*`,
    ``,
    `送信日: ${today}`,
    `送信成功: ${results.staff_notified}名`,
  ];

  if (results.staff_skipped > 0) {
    summaryLines.push(`スキップ（シートに情報なし）: ${results.staff_skipped}名`);
  }

  if (sheetError) {
    summaryLines.push(`⚠️ シート読み取りエラー: フォールバックメッセージを送信`);
  }

  // 個別の支払い金額サマリー
  if (summaryAmounts.length > 0) {
    summaryLines.push(``);
    summaryLines.push(`*支払い金額一覧:*`);
    for (const { name, total } of summaryAmounts) {
      summaryLines.push(`• ${name}: ${formatYen(total)}円`);
    }
    const grandTotal = summaryAmounts.reduce((sum, s) => sum + s.total, 0);
    summaryLines.push(`合計: ${formatYen(grandTotal)}円`);
  }

  if (skippedNames.length > 0) {
    summaryLines.push(``);
    summaryLines.push(`ℹ️ シートに情報なし: ${skippedNames.join("、")}`);
  }

  if (failedNames.length > 0) {
    summaryLines.push(`⚠️ 送信失敗: ${failedNames.join("、")}`);
  }

  await sendSlackMessage(REPORT_CHANNEL, summaryLines.join("\n"));

  return NextResponse.json({
    ok: true,
    date: today,
    month: monthLabel,
    results,
    timestamp: now.toISOString(),
  });
}
