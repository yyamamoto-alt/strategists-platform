import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/competitors/meta-ads?query=ケース面接
 * Meta Ad Library APIで競合の広告を検索
 *
 * Meta Ad Library API docs:
 * - search_terms: キーワード検索
 * - ad_reached_countries: 配信国
 * - ad_active_status: ACTIVE / INACTIVE / ALL
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || "";
  const pageId = searchParams.get("page_id") || "";
  const status = searchParams.get("status") || "ALL";

  const accessToken = process.env.META_ADS_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "META_ADS_ACCESS_TOKEN not configured" }, { status: 500 });
  }

  try {
    const params = new URLSearchParams({
      access_token: accessToken,
      ad_reached_countries: '["JP"]',
      ad_active_status: status,
      fields: "id,ad_creation_time,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,page_id,page_name,publisher_platforms,estimated_audience_size",
      limit: "25",
    });

    // ページID指定 or キーワード検索
    if (pageId) {
      params.set("search_page_ids", pageId);
    } else if (query) {
      params.set("search_terms", query);
    } else {
      return NextResponse.json({ error: "query or page_id is required" }, { status: 400 });
    }

    const url = `https://graph.facebook.com/v25.0/ads_archive?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      console.error("[Meta Ad Library] API error:", data.error);
      return NextResponse.json({ error: data.error.message }, { status: 400 });
    }

    // 結果を整形
    const ads = (data.data || []).map((ad: Record<string, unknown>) => ({
      id: ad.id,
      page_name: ad.page_name,
      page_id: ad.page_id,
      bodies: ad.ad_creative_bodies || [],
      link_titles: ad.ad_creative_link_titles || [],
      link_captions: ad.ad_creative_link_captions || [],
      start_date: ad.ad_delivery_start_time,
      stop_date: ad.ad_delivery_stop_time,
      creation_time: ad.ad_creation_time,
      platforms: ad.publisher_platforms || [],
      estimated_audience: ad.estimated_audience_size,
    }));

    return NextResponse.json({
      ads,
      total: ads.length,
      paging: data.paging || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Meta Ad Library] Fetch error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
