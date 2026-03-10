import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GA4_PROPERTY_ID = "341645724";
const SC_SITE_URL = "sc-domain:akagiconsulting.com";
const GOOGLE_ADS_CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID || "9777096652";
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";

// OAuth tokens from environment
function getOAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function refreshAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// GA4 Data API (REST)
async function fetchGA4Report(accessToken: string, body: Record<string, unknown>) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    { method: "POST", headers: getOAuthHeaders(accessToken), body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`GA4 API error: ${res.status} ${await res.text()}`);
  return res.json();
}

// Search Console API (REST)
async function fetchSCReport(accessToken: string, body: Record<string, unknown>) {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SC_SITE_URL)}/searchAnalytics/query`,
    { method: "POST", headers: getOAuthHeaders(accessToken), body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`SC API error: ${res.status} ${await res.text()}`);
  return res.json();
}

function classifySegment(pagePath: string): string {
  if (pagePath.startsWith("/blog/")) return "blog";
  if (pagePath === "/" || pagePath === "") return "lp_main";
  if (pagePath.startsWith("/lp3")) return "lp3";
  return "other";
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// SC data has ~3 day delay
function scDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const results: Record<string, unknown> = {};
  const dateStr = yesterday();

  try {
    const accessToken = await refreshAccessToken();

    // ========================================
    // 1. GA4: ページ別KPI (ブログ記事 + LP + その他)
    // ========================================
    const ga4Pages = await fetchGA4Report(accessToken, {
      dateRanges: [{ startDate: dateStr, endDate: dateStr }],
      dimensions: [
        { name: "pageTitle" },
        { name: "pagePath" },
      ],
      metrics: [
        { name: "screenPageViews" },
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
      ],
      limit: "500",
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    });

    // /schedule/ visits per session (for CV calculation)
    // Get sessions that visited /schedule/ grouped by landing page
    const ga4ScheduleVisits = await fetchGA4Report(accessToken, {
      dateRanges: [{ startDate: dateStr, endDate: dateStr }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: {
          fieldName: "pagePath",
          stringFilter: { matchType: "BEGINS_WITH", value: "/schedule" },
        },
      },
    });
    const totalScheduleVisits = (ga4ScheduleVisits.rows || []).reduce(
      (sum: number, r: { metricValues: { value: string }[] }) =>
        sum + parseInt(r.metricValues[0].value),
      0
    );

    const pageRows = (ga4Pages.rows || []).map(
      (r: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
        date: dateStr,
        page_path: r.dimensionValues[1].value,
        page_title: r.dimensionValues[0].value,
        segment: classifySegment(r.dimensionValues[1].value),
        pageviews: parseInt(r.metricValues[0].value),
        sessions: parseInt(r.metricValues[1].value),
        users: parseInt(r.metricValues[2].value),
        new_users: parseInt(r.metricValues[3].value),
        avg_session_duration: parseFloat(r.metricValues[4].value),
        bounce_rate: parseFloat(r.metricValues[5].value),
        schedule_visits: 0,
      })
    );

    // Distribute schedule visits proportionally (or just store total separately)
    if (pageRows.length > 0 && totalScheduleVisits > 0) {
      const scheduleRow = pageRows.find((r: { page_path: string }) => r.page_path.startsWith("/schedule"));
      if (scheduleRow) scheduleRow.schedule_visits = totalScheduleVisits;
    }

    if (pageRows.length > 0) {
      const { error } = await supabase
        .from("analytics_page_daily")
        .upsert(pageRows, { onConflict: "date,page_path" });
      if (error) throw new Error(`Page daily upsert error: ${error.message}`);
    }
    results.pages = pageRows.length;

    // ========================================
    // 2. GA4: LP流入経路別 (/ と /lp3/)
    // ========================================
    const trafficRows: Record<string, unknown>[] = [];

    for (const lp of ["/", "/lp3/"]) {
      const matchType = lp === "/" ? "EXACT" : "BEGINS_WITH";
      const ga4Traffic = await fetchGA4Report(accessToken, {
        dateRanges: [{ startDate: dateStr, endDate: dateStr }],
        dimensions: [
          { name: "sessionSource" },
          { name: "sessionMedium" },
          { name: "sessionCampaignName" },
          { name: "sessionDefaultChannelGroup" },
        ],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "conversions" },
        ],
        dimensionFilter: {
          filter: {
            fieldName: "landingPage",
            stringFilter: { matchType, value: lp === "/" ? "/" : "/lp3" },
          },
        },
        limit: "100",
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      });

      for (const r of ga4Traffic.rows || []) {
        trafficRows.push({
          date: dateStr,
          landing_page: lp,
          source: r.dimensionValues[0].value,
          medium: r.dimensionValues[1].value,
          campaign: r.dimensionValues[2].value,
          channel_group: r.dimensionValues[3].value,
          sessions: parseInt(r.metricValues[0].value),
          users: parseInt(r.metricValues[1].value),
          new_users: parseInt(r.metricValues[2].value),
          schedule_visits: Math.round(parseFloat(r.metricValues[3].value)),
        });
      }
    }

    if (trafficRows.length > 0) {
      const { error } = await supabase
        .from("analytics_traffic_daily")
        .upsert(trafficRows, { onConflict: "date,landing_page,source,medium,campaign" });
      if (error) throw new Error(`Traffic daily upsert error: ${error.message}`);
    }
    results.traffic = trafficRows.length;

    // ========================================
    // 3. Search Console: ページ × クエリ (クリック1以上)
    // ========================================
    const scDateStr = scDate();

    const scData = await fetchSCReport(accessToken, {
      startDate: scDateStr,
      endDate: scDateStr,
      dimensions: ["page", "query"],
      rowLimit: 5000,
    });

    const searchRows = (scData.rows || [])
      .filter((r: { clicks: number }) => r.clicks > 0)
      .map((r: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
        date: scDateStr,
        page_path: r.keys[0].replace("https://akagiconsulting.com", ""),
        query: r.keys[1],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));

    if (searchRows.length > 0) {
      const { error } = await supabase
        .from("analytics_search_daily")
        .upsert(searchRows, { onConflict: "date,page_path,query" });
      if (error) throw new Error(`Search daily upsert error: ${error.message}`);
    }
    results.search = searchRows.length;

    // ========================================
    // 4. GA4: 時間帯別KPI (analytics_page_hourly)
    // ========================================
    const ga4Hourly = await fetchGA4Report(accessToken, {
      dateRanges: [{ startDate: dateStr, endDate: dateStr }],
      dimensions: [
        { name: "hour" },
        { name: "pagePath" },
      ],
      metrics: [
        { name: "screenPageViews" },
        { name: "sessions" },
        { name: "totalUsers" },
      ],
      limit: "1000",
      orderBys: [{ dimension: { dimensionName: "hour" }, desc: false }],
    });

    // Aggregate by (hour, segment)
    const hourlyAgg: Record<string, { pageviews: number; sessions: number; users: number }> = {};
    for (const r of ga4Hourly.rows || []) {
      const hour = parseInt(r.dimensionValues[0].value);
      const pagePath = r.dimensionValues[1].value;
      const segment = classifySegment(pagePath);
      const key = `${hour}::${segment}`;
      if (!hourlyAgg[key]) {
        hourlyAgg[key] = { pageviews: 0, sessions: 0, users: 0 };
      }
      hourlyAgg[key].pageviews += parseInt(r.metricValues[0].value);
      hourlyAgg[key].sessions += parseInt(r.metricValues[1].value);
      hourlyAgg[key].users += parseInt(r.metricValues[2].value);
    }

    const hourlyRows = Object.entries(hourlyAgg).map(([key, vals]) => {
      const [hourStr, segment] = key.split("::");
      return {
        date: dateStr,
        hour: parseInt(hourStr),
        segment,
        pageviews: vals.pageviews,
        sessions: vals.sessions,
        users: vals.users,
      };
    });

    if (hourlyRows.length > 0) {
      const { error } = await supabase
        .from("analytics_page_hourly")
        .upsert(hourlyRows, { onConflict: "date,hour,segment" });
      if (error) throw new Error(`Hourly upsert error: ${error.message}`);
    }
    results.hourly = hourlyRows.length;

    // ========================================
    // 5. Google Ads: キャンペーン別 + キーワード別 (日次)
    // ========================================
    if (GOOGLE_ADS_DEVELOPER_TOKEN) {
      try {
        const adsHeaders = {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
          "Content-Type": "application/json",
        };

        // 5a. Campaign daily
        const campaignQuery = `
          SELECT
            segments.date,
            campaign.name,
            campaign.status,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.average_cpc,
            metrics.cost_micros,
            metrics.conversions,
            metrics.cost_per_conversion
          FROM campaign
          WHERE segments.date = '${dateStr}'
            AND campaign.status != 'REMOVED'
          ORDER BY metrics.cost_micros DESC
        `;

        const adsRes = await fetch(
          `https://googleads.googleapis.com/v18/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:searchStream`,
          { method: "POST", headers: adsHeaders, body: JSON.stringify({ query: campaignQuery }) }
        );

        if (adsRes.ok) {
          const adsData = await adsRes.json();
          const campaignRows: Record<string, unknown>[] = [];

          for (const batch of adsData || []) {
            for (const result of batch.results || []) {
              const m = result.metrics;
              const costMicros = parseInt(m?.costMicros || "0");
              const avgCpcMicros = parseInt(m?.averageCpc || "0");
              const costPerConvMicros = parseInt(m?.costPerConversion || "0");
              campaignRows.push({
                date: dateStr,
                campaign_name: result.campaign?.name || "Unknown",
                campaign_status: result.campaign?.status || "ENABLED",
                impressions: parseInt(m?.impressions || "0"),
                clicks: parseInt(m?.clicks || "0"),
                ctr: parseFloat(m?.ctr || "0") * 100,
                avg_cpc: avgCpcMicros / 1_000_000,
                cost: costMicros / 1_000_000,
                conversions: parseFloat(m?.conversions || "0"),
                cost_per_conversion: costPerConvMicros / 1_000_000,
              });
            }
          }

          if (campaignRows.length > 0) {
            const { error } = await supabase
              .from("analytics_ads_campaign_daily")
              .upsert(campaignRows, { onConflict: "date,campaign_name" });
            if (error) console.error("Ads campaign upsert error:", error.message);
          }
          results.ads_campaigns = campaignRows.length;
        } else {
          console.error("Google Ads campaign API error:", adsRes.status, await adsRes.text().catch(() => ""));
        }

        // 5b. Keyword daily
        const keywordQuery = `
          SELECT
            segments.date,
            campaign.name,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.cost_micros,
            metrics.conversions
          FROM keyword_view
          WHERE segments.date = '${dateStr}'
            AND campaign.status != 'REMOVED'
            AND ad_group.status != 'REMOVED'
            AND metrics.impressions > 0
          ORDER BY metrics.impressions DESC
          LIMIT 100
        `;

        const kwRes = await fetch(
          `https://googleads.googleapis.com/v18/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:searchStream`,
          { method: "POST", headers: adsHeaders, body: JSON.stringify({ query: keywordQuery }) }
        );

        if (kwRes.ok) {
          const kwData = await kwRes.json();
          const keywordRows: Record<string, unknown>[] = [];

          for (const batch of kwData || []) {
            for (const result of batch.results || []) {
              const m = result.metrics;
              const costMicros = parseInt(m?.costMicros || "0");
              const matchType = result.adGroupCriterion?.keyword?.matchType || "BROAD";
              keywordRows.push({
                date: dateStr,
                campaign_name: result.campaign?.name || "Unknown",
                keyword: result.adGroupCriterion?.keyword?.text || "Unknown",
                match_type: matchType,
                impressions: parseInt(m?.impressions || "0"),
                clicks: parseInt(m?.clicks || "0"),
                ctr: parseFloat(m?.ctr || "0") * 100,
                cost: costMicros / 1_000_000,
                conversions: parseFloat(m?.conversions || "0"),
              });
            }
          }

          if (keywordRows.length > 0) {
            const { error } = await supabase
              .from("analytics_ads_keyword_daily")
              .upsert(keywordRows, { onConflict: "date,campaign_name,keyword,match_type" });
            if (error) console.error("Ads keyword upsert error:", error.message);
          }
          results.ads_keywords = keywordRows.length;
        } else {
          console.error("Google Ads keyword API error:", kwRes.status, await kwRes.text().catch(() => ""));
        }
      } catch (adsError) {
        console.error("Google Ads sync error:", adsError);
        results.ads_error = adsError instanceof Error ? adsError.message : "Unknown";
      }
    }

    return NextResponse.json({
      success: true,
      date: dateStr,
      sc_date: scDateStr,
      total_schedule_visits: totalScheduleVisits,
      ...results,
    });
  } catch (error) {
    console.error("Analytics sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
