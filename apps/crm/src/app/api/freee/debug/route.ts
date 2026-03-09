import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getValidAccessToken, freeeApiFetch } from "@/lib/freee";

export const dynamic = "force-dynamic";

/**
 * GET /api/freee/debug
 * freee APIのレスポンス構造を確認するデバッグ用
 */
export async function GET() {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: settings } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "freee_connected",
      "freee_access_token",
      "freee_refresh_token",
      "freee_token_expires_at",
      "freee_company_id",
    ]);

  const settingMap: Record<string, string> = {};
  if (settings) {
    for (const s of settings as { key: string; value: unknown }[]) {
      settingMap[s.key] = typeof s.value === "string" ? s.value.replace(/"/g, "") : String(s.value ?? "");
    }
  }

  if (settingMap.freee_connected !== "true") {
    return NextResponse.json({ error: "freee未連携", settings: Object.keys(settingMap) });
  }

  try {
    const { accessToken } = await getValidAccessToken(
      settingMap.freee_access_token,
      settingMap.freee_refresh_token,
      settingMap.freee_token_expires_at,
    );

    const companyId = settingMap.freee_company_id;
    const currentYear = new Date().getFullYear();

    // 1. trial_pl の生レスポンスを取得（今年度）
    let trialPl = null;
    let trialPlError = null;
    try {
      trialPl = await freeeApiFetch(
        accessToken,
        `/api/1/reports/trial_pl?company_id=${companyId}&fiscal_year=${currentYear}`,
      );
    } catch (e) {
      trialPlError = e instanceof Error ? e.message : String(e);
    }

    // 2. trial_pl の前年度
    let trialPlPrev = null;
    let trialPlPrevError = null;
    try {
      trialPlPrev = await freeeApiFetch(
        accessToken,
        `/api/1/reports/trial_pl?company_id=${companyId}&fiscal_year=${currentYear - 1}`,
      );
    } catch (e) {
      trialPlPrevError = e instanceof Error ? e.message : String(e);
    }

    // レスポンスの構造を確認（balancesの最初の数件 + キー一覧）
    const summarize = (data: unknown) => {
      if (!data || typeof data !== "object") return data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      return {
        topLevelKeys: Object.keys(d),
        balancesCount: d.balances?.length,
        balancesSample: d.balances?.slice(0, 5).map((b: Record<string, unknown>) => ({
          ...b,
          // monthly_balances は長いのでキーだけ
          monthly_balances_count: Array.isArray(b.monthly_balances) ? (b.monthly_balances as unknown[]).length : undefined,
          monthly_balances_sample: Array.isArray(b.monthly_balances) ? (b.monthly_balances as unknown[]).slice(0, 2) : undefined,
        })),
      };
    };

    return NextResponse.json({
      companyId,
      fiscalYear: currentYear,
      trialPl: trialPl ? summarize(trialPl) : null,
      trialPlError,
      trialPlPrev: trialPlPrev ? summarize(trialPlPrev) : null,
      trialPlPrevError,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
