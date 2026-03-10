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
  items: { category: string; amount: number; count?: number; clCount?: number }[];
};

/**
 * スプレッドシートからスタッフ別の支払い情報を解析する
 *
 * Zapier準拠: シートは行ベースの構造
 * - 行ヘッダー(A列相当): "名前-カテゴリ" 形式（例: "喜山", "喜山-営業報酬", "喜山-営業数"）
 * - 列ヘッダー(行1): 月ラベル（例: "2025/7", "2025/8"）
 * - データ: 各セルに金額や回数
 *
 * 列ベースのシート（名前列 + カテゴリ列）にもフォールバック対応
 */
function parsePaymentSheet(
  rows: string[][],
  targetMonth?: string
): Map<string, PaymentBreakdown> {
  if (rows.length < 2) return new Map();

  const headers = rows[0];

  // まず行ベース（Zapier形式）か列ベースかを判定
  // 行ベース: ヘッダーが "YYYY/M" のような月ラベルを含む
  const monthPattern = /^\d{4}\/\d{1,2}$/;
  const hasMonthHeaders = headers.some((h) => monthPattern.test(h?.trim() || ""));

  if (hasMonthHeaders) {
    return parseRowBasedSheet(rows, targetMonth);
  }

  // 列ベース（フォールバック）
  return parseColumnBasedSheet(rows);
}

/** Zapier準拠: 行ベースの支払いシート解析 */
function parseRowBasedSheet(
  rows: string[][],
  targetMonth?: string
): Map<string, PaymentBreakdown> {
  const headers = rows[0];

  // 対象月のカラムインデックスを特定
  const now = new Date();
  // Zapierは先月分を表示（14日に実行 → 先月の支払い確認）
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthKey = targetMonth || `${prevMonth.getFullYear()}/${prevMonth.getMonth() + 1}`;

  let monthColIdx = headers.findIndex((h) => h?.trim() === monthKey);
  if (monthColIdx === -1) {
    // "2025/07" 形式も試す
    const paddedKey = `${prevMonth.getFullYear()}/${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
    monthColIdx = headers.findIndex((h) => h?.trim() === paddedKey);
  }
  if (monthColIdx === -1) return new Map();

  // 人ごとにデータを集約
  // 行形式: "喜山" (合計行), "喜山-稼働報酬", "喜山-営業報酬", "喜山-営業数", "喜山-営業(直前CL)数" etc.
  const personData = new Map<string, Record<string, number>>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const nameCell = (row[0] || "").trim();
    if (!nameCell) continue;

    const rawValue = row[monthColIdx] || "";
    const cleaned = rawValue.replace(/[,，円¥\s]/g, "");
    const value = cleaned ? parseInt(cleaned, 10) : 0;
    if (isNaN(value)) continue;

    // "name-category" 形式を分解
    const dashIdx = nameCell.indexOf("-");
    if (dashIdx === -1) {
      // カテゴリなし → 合計報酬行
      if (!personData.has(nameCell)) personData.set(nameCell, {});
      personData.get(nameCell)!["合計報酬"] = value;
    } else {
      const name = nameCell.slice(0, dashIdx).trim();
      const category = nameCell.slice(dashIdx + 1).trim();
      if (!personData.has(name)) personData.set(name, {});
      personData.get(name)![category] = value;
    }
  }

  // PaymentBreakdown に変換
  const result = new Map<string, PaymentBreakdown>();
  for (const [name, data] of personData) {
    const items: PaymentBreakdown["items"] = [];

    for (const cat of PAYMENT_CATEGORIES) {
      const amount = data[cat] || 0;
      const item: PaymentBreakdown["items"][0] = { category: cat, amount };

      // 回数情報を付加
      if (cat === "営業報酬") {
        item.count = data["営業数"] || undefined;
        item.clCount = data["営業(直前CL)数"] || data["直前CL営業数"] || undefined;
      } else if (cat === "指導報酬") {
        item.count = data["指導数"] || undefined;
        item.clCount = data["指導(直前CL)数"] || data["直前CL指導数"] || undefined;
      }

      items.push(item);
    }

    // 合計: シートの合計報酬行があればそれを使用、なければ計算
    let total = data["合計報酬"] || 0;
    if (!total) {
      total = (data["稼働報酬"] || 0)
        + (data["営業報酬"] || 0)
        + (data["指導報酬"] || 0)
        + (data["臨時報酬"] || 0)
        - (data["経費"] || 0);
    }

    if (total > 0 || items.some((it) => it.amount !== 0)) {
      result.set(name, { total, items });
    }
  }

  return result;
}

/** 列ベースのシート解析（フォールバック） */
function parseColumnBasedSheet(rows: string[][]): Map<string, PaymentBreakdown> {
  const headers = rows[0];

  let nameColIdx = headers.findIndex(
    (h) => h === "名前" || h === "氏名" || h === "スタッフ名"
  );
  if (nameColIdx === -1) nameColIdx = 0;

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
      const cleaned = rawValue.replace(/[,，円¥\s]/g, "");
      const amount = cleaned ? parseInt(cleaned, 10) : 0;
      if (!isNaN(amount) && amount !== 0) {
        items.push({ category, amount });
        total += amount;
      }
    }

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

      // Zapier準拠: 回数情報付きの内訳メッセージ
      const breakdownLines = breakdown.items.map(({ category, amount, count, clCount }) => {
        let countStr = "";
        if (count != null) {
          countStr = clCount ? `（${count}回 + 直前CL${clCount}回）` : `（${count}回）`;
        }
        const prefix = category === "指導報酬" ? "-🧑" : "-";
        return `${prefix}${category}\t${formatYen(amount)}円${countStr}`;
      });

      // 前月ラベル（Zapier準拠: "YYYY/M"形式）
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthLabel2 = `${prevMonth.getFullYear()}/${prevMonth.getMonth() + 1}`;

      const dmMessage = [
        `(自動送信)`,
        `【${monthLabel2}分の支払概要】`,
        ``,
        `支払予定額 ${formatYen(breakdown.total)}円`,
        ``,
        ...breakdownLines,
        ``,
        `※今月14日時点の請求状況に基づいて自動計算されています。認識に齟齬があれば3日以内にお知らせください。過ぎた場合の支払いは原則翌月に持ち越しさせていただきます。※営業や指導のカウントは提出日基準`,
        `※自動計算システムが送付しています。万が一間違いがありましたら申し訳ございません.`,
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

  // 経営reportチャンネルにサマリー投稿（Zapier準拠: "経理bot"名義 + 支払い予定一覧）
  const prevMonthForSummary = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const summaryMonthLabel = `${prevMonthForSummary.getFullYear()}年${prevMonthForSummary.getMonth() + 1}月`;

  const summaryLines = [
    `*【${summaryMonthLabel}の支払い予定】*`,
  ];

  // 個別の支払い金額一覧
  if (summaryAmounts.length > 0) {
    for (const { name, total } of summaryAmounts) {
      summaryLines.push(`${name}: ${formatYen(total)}円`);
    }
    const grandTotal = summaryAmounts.reduce((sum, s) => sum + s.total, 0);
    summaryLines.push(``);
    summaryLines.push(`*合計: ${formatYen(grandTotal)}円*`);
  }

  if (results.staff_skipped > 0) {
    summaryLines.push(``);
    summaryLines.push(`シートに情報なし: ${skippedNames.join("、")}`);
  }

  if (sheetError) {
    summaryLines.push(`⚠️ シート読み取りエラー: フォールバックメッセージを送信`);
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
