import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getValidAccessToken, fetchMonthlyPL } from "@/lib/freee";

export const dynamic = "force-dynamic";

/**
 * GET /api/freee/pl?startYear=2025&endYear=2026
 * freee P&Lデータ（月別の原価・販管費）を取得
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const currentYear = new Date().getFullYear();
  const startYear = Number(url.searchParams.get("startYear")) || currentYear - 1;
  const endYear = Number(url.searchParams.get("endYear")) || currentYear;

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // freee接続チェック
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
    return NextResponse.json({ error: "freee未連携" }, { status: 400 });
  }

  try {
    // トークン取得・自動リフレッシュ
    const { accessToken, refreshToken, refreshed } = await getValidAccessToken(
      settingMap.freee_access_token,
      settingMap.freee_refresh_token,
      settingMap.freee_token_expires_at,
    );

    // リフレッシュされたらDB更新
    if (refreshed) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const updates = [
        { key: "freee_access_token", value: accessToken },
        { key: "freee_refresh_token", value: refreshToken },
        { key: "freee_token_expires_at", value: expiresAt },
      ];
      for (const u of updates) {
        await db.from("app_settings").upsert(
          { key: u.key, value: u.value, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      }
    }

    const companyId = Number(settingMap.freee_company_id);
    const plData = await fetchMonthlyPL(accessToken, companyId, startYear, endYear);

    return NextResponse.json(plData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("freee PL fetch error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
