import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getValidAccessToken, fetchMonthlyPL } from "@/lib/freee";
import type { FreeePLMonthly } from "@/lib/freee";

export const dynamic = "force-dynamic";

const CACHE_KEY = "freee_pl_cache";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6時間

interface PLCache {
  data: FreeePLMonthly[];
  startYear: number;
  endYear: number;
  cachedAt: string;
}

/**
 * GET /api/freee/pl?startYear=2025&endYear=2026&refresh=1
 * freee P&Lデータ（月別の売上・原価・販管費）を取得
 * 6時間キャッシュ（app_settingsに保存）、refresh=1で強制更新
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentFiscalYear = currentMonth >= 4 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
  const startYear = Number(url.searchParams.get("startYear")) || currentFiscalYear - 1;
  const endYear = Number(url.searchParams.get("endYear")) || currentFiscalYear;
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // freee接続チェック + キャッシュ + トークンを一括取得
  const { data: settings } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "freee_connected",
      "freee_access_token",
      "freee_refresh_token",
      "freee_token_expires_at",
      "freee_company_id",
      CACHE_KEY,
    ]);

  const settingMap: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawCacheValue: any = null;
  if (settings) {
    for (const s of settings as { key: string; value: unknown }[]) {
      if (s.key === CACHE_KEY) {
        rawCacheValue = s.value;
      } else {
        settingMap[s.key] = typeof s.value === "string" ? s.value.replace(/"/g, "") : String(s.value ?? "");
      }
    }
  }

  if (settingMap.freee_connected !== "true") {
    return NextResponse.json({ error: "freee未連携" }, { status: 400 });
  }

  // キャッシュチェック（強制更新でなければ）
  if (!forceRefresh && rawCacheValue) {
    try {
      const cache: PLCache = typeof rawCacheValue === "string" ? JSON.parse(rawCacheValue) : rawCacheValue;
      const cacheAge = Date.now() - new Date(cache.cachedAt).getTime();
      if (cacheAge < CACHE_TTL_MS && cache.startYear === startYear && cache.endYear === endYear) {
        return NextResponse.json(cache.data, {
          headers: { "X-Cache": "HIT", "X-Cache-Age": String(Math.round(cacheAge / 1000)) },
        });
      }
    } catch {
      // キャッシュ破損 → 再取得
    }
  }

  try {
    const { accessToken, refreshToken, refreshed } = await getValidAccessToken(
      settingMap.freee_access_token,
      settingMap.freee_refresh_token,
      settingMap.freee_token_expires_at,
    );

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

    // キャッシュ保存
    const cachePayload: PLCache = {
      data: plData,
      startYear,
      endYear,
      cachedAt: new Date().toISOString(),
    };
    await db.from("app_settings").upsert(
      { key: CACHE_KEY, value: cachePayload, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

    return NextResponse.json(plData, {
      headers: { "X-Cache": "MISS" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("freee PL fetch error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
