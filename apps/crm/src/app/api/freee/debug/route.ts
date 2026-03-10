import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { freeeApiFetch } from "@/lib/freee";

export const dynamic = "force-dynamic";

/**
 * GET /api/freee/debug - freee接続診断（デバッグ用、問題解決後に削除）
 */
export async function GET() {
  const steps: { step: string; result: string; ok: boolean }[] = [];

  try {
    // Step 1: DB接続
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: settings, error: dbError } = await db
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "freee_connected",
        "freee_access_token",
        "freee_refresh_token",
        "freee_token_expires_at",
        "freee_company_id",
      ]);

    if (dbError) {
      steps.push({ step: "DB read", result: `Error: ${dbError.message}`, ok: false });
      return NextResponse.json({ steps });
    }
    steps.push({ step: "DB read", result: `Got ${settings?.length || 0} settings`, ok: true });

    // Step 2: Parse settings
    const settingMap: Record<string, string> = {};
    for (const s of (settings || []) as { key: string; value: unknown }[]) {
      const raw = s.value;
      const parsed = typeof raw === "string" ? raw.replace(/"/g, "") : String(raw ?? "");
      settingMap[s.key] = parsed;
      steps.push({
        step: `Parse ${s.key}`,
        result: `type=${typeof raw}, len=${String(parsed).length}, preview=${String(parsed).substring(0, 15)}...`,
        ok: parsed.length > 0,
      });
    }

    // Step 3: Check connected
    if (settingMap.freee_connected !== "true") {
      steps.push({ step: "Connected check", result: `freee_connected=${settingMap.freee_connected}`, ok: false });
      return NextResponse.json({ steps });
    }
    steps.push({ step: "Connected check", result: "OK", ok: true });

    // Step 4: Check token expiry
    const expiresAt = settingMap.freee_token_expires_at;
    const now = new Date();
    const expiry = new Date(expiresAt);
    const isExpired = now >= new Date(expiry.getTime() - 5 * 60 * 1000);
    steps.push({
      step: "Token expiry",
      result: `expires=${expiresAt}, now=${now.toISOString()}, expired=${isExpired}`,
      ok: !isExpired,
    });

    // Step 5: Test freee API
    const accessToken = settingMap.freee_access_token;
    const companyId = settingMap.freee_company_id;
    try {
      const data = await freeeApiFetch(
        accessToken,
        `/api/1/reports/trial_pl?company_id=${companyId}&fiscal_year=2025&start_month=4&end_month=4`,
      );
      const balanceCount = data?.trial_pl?.balances?.length || 0;
      steps.push({ step: "freee API call", result: `OK, ${balanceCount} balances`, ok: true });
    } catch (e) {
      steps.push({ step: "freee API call", result: `Error: ${e instanceof Error ? e.message : e}`, ok: false });
    }
  } catch (e) {
    steps.push({ step: "Unexpected", result: `${e instanceof Error ? e.message : e}`, ok: false });
  }

  return NextResponse.json({ steps });
}
