import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GA4_PROPERTY_ID = "341645724";
const SC_SITE_URL = "sc-domain:akagiconsulting.com";
const GOOGLE_ADS_CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID || "9777096652";
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";

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

async function fetchGA4Report(accessToken: string, body: Record<string, unknown>) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    { method: "POST", headers: getOAuthHeaders(accessToken), body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`GA4 API error: ${res.status} ${await res.text()}`);
  return res.json();
}

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

/** Generate date strings between from and to (inclusive) */
function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/** Default: last 3 days (yesterday, 2 days ago, 3 days ago) for resilience */
function defaultGA4Dates(): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** SC data has ~3 day delay, so offset by 2 extra days */
function scDateFor(ga4Date: string): string {
  const d = new Date(ga4Date + "T00:00:00Z");
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
}

const APPLICATION_CV_ACTIONS = ["既卒(/schedule/遷移)", "新卒(schedule_newgraduate_遷移)"];
const MICRO_CV_ACTION = "マイクロCV";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

async function syncOneDay(
  dateStr: string,
  accessToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Record<string, unknown>> {
  const dayResult: Record<string, unknown> = {};

  // 1. GA4: ページ別KPI
  const ga4Pages = await fetchGA4Report(accessToken, {
    dateRanges: [{ startDate: dateStr, endDate: dateStr }],
    dimensions: [{ name: "pageTitle" }, { name: "pagePath" }],
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
    (sum: number, r: AnyRow) => sum + parseInt(r.metricValues[0].value), 0
  );

  // Deduplicate by page_path (GA4 may return multiple rows with different pageTitles)
  const pageMap = new Map<string, AnyRow>();
  for (const r of ga4Pages.rows || []) {
    const pagePath = r.dimensionValues[1].value;
    const existing = pageMap.get(pagePath);
    if (existing) {
      existing.pageviews += parseInt(r.metricValues[0].value);
      existing.sessions += parseInt(r.metricValues[1].value);
      existing.users += parseInt(r.metricValues[2].value);
      existing.new_users += parseInt(r.metricValues[3].value);
    } else {
      pageMap.set(pagePath, {
        date: dateStr,
        page_path: pagePath,
        page_title: r.dimensionValues[0].value,
        segment: classifySegment(pagePath),
        pageviews: parseInt(r.metricValues[0].value),
        sessions: parseInt(r.metricValues[1].value),
        users: parseInt(r.metricValues[2].value),
        new_users: parseInt(r.metricValues[3].value),
        avg_session_duration: parseFloat(r.metricValues[4].value),
        bounce_rate: parseFloat(r.metricValues[5].value),
        schedule_visits: 0,
      });
    }
  }
  const pageRows = Array.from(pageMap.values());

  if (pageRows.length > 0 && totalScheduleVisits > 0) {
    const scheduleRow = pageRows.find((r: AnyRow) => r.page_path.startsWith("/schedule"));
    if (scheduleRow) scheduleRow.schedule_visits = totalScheduleVisits;
  }

  if (pageRows.length > 0) {
    const { error } = await supabase
      .from("analytics_page_daily")
      .upsert(pageRows, { onConflict: "date,page_path" });
    if (error) throw new Error(`Page daily upsert error: ${error.message}`);
  }
  dayResult.pages = pageRows.length;

  // 2. GA4: LP流入経路別
  const trafficRows: AnyRow[] = [];
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
  dayResult.traffic = trafficRows.length;

  // 3. Search Console (offset by 2 days for SC delay)
  const scDateStr = scDateFor(dateStr);
  const scData = await fetchSCReport(accessToken, {
    startDate: scDateStr,
    endDate: scDateStr,
    dimensions: ["page", "query"],
    rowLimit: 5000,
  });

  const searchRows = (scData.rows || [])
    .filter((r: AnyRow) => r.clicks > 0)
    .map((r: AnyRow) => ({
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
  dayResult.search = searchRows.length;
  dayResult.sc_date = scDateStr;

  // 4. GA4: 時間帯別KPI
  const ga4Hourly = await fetchGA4Report(accessToken, {
    dateRanges: [{ startDate: dateStr, endDate: dateStr }],
    dimensions: [{ name: "hour" }, { name: "pagePath" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "sessions" },
      { name: "totalUsers" },
    ],
    limit: "1000",
    orderBys: [{ dimension: { dimensionName: "hour" }, desc: false }],
  });

  const hourlyAgg: Record<string, { pageviews: number; sessions: number; users: number }> = {};
  for (const r of ga4Hourly.rows || []) {
    const hour = parseInt(r.dimensionValues[0].value);
    const pagePath = r.dimensionValues[1].value;
    const segment = classifySegment(pagePath);
    const key = `${hour}::${segment}`;
    if (!hourlyAgg[key]) hourlyAgg[key] = { pageviews: 0, sessions: 0, users: 0 };
    hourlyAgg[key].pageviews += parseInt(r.metricValues[0].value);
    hourlyAgg[key].sessions += parseInt(r.metricValues[1].value);
    hourlyAgg[key].users += parseInt(r.metricValues[2].value);
  }

  const hourlyRows = Object.entries(hourlyAgg).map(([key, vals]) => {
    const [hourStr, segment] = key.split("::");
    return { date: dateStr, hour: parseInt(hourStr), segment, ...vals };
  });

  if (hourlyRows.length > 0) {
    const { error } = await supabase
      .from("analytics_page_hourly")
      .upsert(hourlyRows, { onConflict: "date,hour,segment" });
    if (error) throw new Error(`Hourly upsert error: ${error.message}`);
  }
  dayResult.hourly = hourlyRows.length;

  // 5. Google Ads
  if (GOOGLE_ADS_DEVELOPER_TOKEN) {
    try {
      async function adsSearchStream(query: string) {
        const res = await fetch(
          `https://googleads.googleapis.com/v18/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:searchStream`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
          }
        );
        if (!res.ok) {
          console.error("Google Ads API error:", res.status, await res.text().catch(() => ""));
          return null;
        }
        return res.json();
      }

      // 5a. Campaign daily
      const campaignData = await adsSearchStream(`
        SELECT segments.date, campaign.name, campaign.status,
          metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
          metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion
        FROM campaign
        WHERE segments.date = '${dateStr}' AND campaign.status != 'REMOVED'
        ORDER BY metrics.cost_micros DESC
      `);

      // 5b. Campaign CV breakdown
      const campaignCvData = await adsSearchStream(`
        SELECT segments.date, campaign.name, segments.conversion_action_name, metrics.conversions
        FROM campaign
        WHERE segments.date = '${dateStr}' AND campaign.status != 'REMOVED' AND metrics.conversions > 0
      `);

      const cvLookup: Record<string, { cv_application: number; cv_micro: number }> = {};
      if (campaignCvData) {
        for (const batch of campaignCvData) {
          for (const result of batch.results || []) {
            const name = result.campaign?.name || "";
            const action = result.segments?.conversionActionName || "";
            const cv = parseFloat(result.metrics?.conversions || "0");
            if (!cvLookup[name]) cvLookup[name] = { cv_application: 0, cv_micro: 0 };
            if (APPLICATION_CV_ACTIONS.includes(action)) cvLookup[name].cv_application += cv;
            else if (action === MICRO_CV_ACTION) cvLookup[name].cv_micro += cv;
          }
        }
      }

      if (campaignData) {
        const campaignRows: AnyRow[] = [];
        for (const batch of campaignData) {
          for (const result of batch.results || []) {
            const m = result.metrics;
            const name = result.campaign?.name || "Unknown";
            const cvBreakdown = cvLookup[name] || { cv_application: 0, cv_micro: 0 };
            campaignRows.push({
              date: dateStr,
              campaign_name: name,
              campaign_status: result.campaign?.status || "ENABLED",
              impressions: parseInt(m?.impressions || "0"),
              clicks: parseInt(m?.clicks || "0"),
              ctr: parseFloat(m?.ctr || "0") * 100,
              avg_cpc: parseInt(m?.averageCpc || "0") / 1_000_000,
              cost: parseInt(m?.costMicros || "0") / 1_000_000,
              conversions: parseFloat(m?.conversions || "0"),
              cv_application: cvBreakdown.cv_application,
              cv_micro: cvBreakdown.cv_micro,
              cost_per_conversion: parseInt(m?.costPerConversion || "0") / 1_000_000,
            });
          }
        }
        if (campaignRows.length > 0) {
          const { error } = await supabase
            .from("analytics_ads_campaign_daily")
            .upsert(campaignRows, { onConflict: "date,campaign_name" });
          if (error) console.error("Ads campaign upsert error:", error.message);
        }
        dayResult.ads_campaigns = campaignRows.length;
      }

      // 5c. Keyword daily
      const kwData = await adsSearchStream(`
        SELECT segments.date, campaign.name,
          ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
          metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions
        FROM keyword_view
        WHERE segments.date = '${dateStr}'
          AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED'
          AND metrics.impressions > 0
        ORDER BY metrics.impressions DESC LIMIT 100
      `);

      // 5d. Keyword CV breakdown
      const kwCvData = await adsSearchStream(`
        SELECT segments.date, campaign.name,
          ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
          segments.conversion_action_name, metrics.conversions
        FROM keyword_view
        WHERE segments.date = '${dateStr}'
          AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED'
          AND metrics.conversions > 0
      `);

      const kwCvLookup: Record<string, { cv_application: number; cv_micro: number }> = {};
      if (kwCvData) {
        for (const batch of kwCvData) {
          for (const result of batch.results || []) {
            const kwText = result.adGroupCriterion?.keyword?.text || "";
            const mt = result.adGroupCriterion?.keyword?.matchType || "BROAD";
            const campName = result.campaign?.name || "";
            const action = result.segments?.conversionActionName || "";
            const cv = parseFloat(result.metrics?.conversions || "0");
            const key = `${campName}|${kwText}|${mt}`;
            if (!kwCvLookup[key]) kwCvLookup[key] = { cv_application: 0, cv_micro: 0 };
            if (APPLICATION_CV_ACTIONS.includes(action)) kwCvLookup[key].cv_application += cv;
            else if (action === MICRO_CV_ACTION) kwCvLookup[key].cv_micro += cv;
          }
        }
      }

      if (kwData) {
        const keywordRows: AnyRow[] = [];
        for (const batch of kwData) {
          for (const result of batch.results || []) {
            const m = result.metrics;
            const kwText = result.adGroupCriterion?.keyword?.text || "Unknown";
            const matchType = result.adGroupCriterion?.keyword?.matchType || "BROAD";
            const campName = result.campaign?.name || "Unknown";
            const key = `${campName}|${kwText}|${matchType}`;
            const cvBreakdown = kwCvLookup[key] || { cv_application: 0, cv_micro: 0 };
            keywordRows.push({
              date: dateStr,
              campaign_name: campName,
              keyword: kwText,
              match_type: matchType,
              impressions: parseInt(m?.impressions || "0"),
              clicks: parseInt(m?.clicks || "0"),
              ctr: parseFloat(m?.ctr || "0") * 100,
              cost: parseInt(m?.costMicros || "0") / 1_000_000,
              conversions: parseFloat(m?.conversions || "0"),
              cv_application: cvBreakdown.cv_application,
              cv_micro: cvBreakdown.cv_micro,
            });
          }
        }
        if (keywordRows.length > 0) {
          const { error } = await supabase
            .from("analytics_ads_keyword_daily")
            .upsert(keywordRows, { onConflict: "date,campaign_name,keyword,match_type" });
          if (error) console.error("Ads keyword upsert error:", error.message);
        }
        dayResult.ads_keywords = keywordRows.length;
      }
    } catch (adsError) {
      console.error("Google Ads sync error:", adsError);
      dayResult.ads_error = adsError instanceof Error ? adsError.message : "Unknown";
    }
  }

  return dayResult;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  // Determine dates to sync
  let dates: string[];
  if (fromParam && toParam) {
    // Backfill mode: sync specific date range (max 14 days)
    dates = datesBetween(fromParam, toParam);
    if (dates.length > 14) {
      return NextResponse.json(
        { error: "Backfill range too large. Max 14 days at a time." },
        { status: 400 }
      );
    }
  } else {
    // Default: last 3 days for resilience (auto-recovers missed days)
    dates = defaultGA4Dates();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const allResults: Record<string, unknown> = {};

  try {
    const accessToken = await refreshAccessToken();

    for (const dateStr of dates) {
      try {
        allResults[dateStr] = await syncOneDay(dateStr, accessToken, supabase);
      } catch (dayError) {
        console.error(`Sync error for ${dateStr}:`, dayError);
        allResults[dateStr] = {
          error: dayError instanceof Error ? dayError.message : "Unknown error",
        };
      }
    }

    return NextResponse.json({
      success: true,
      dates_synced: dates,
      results: allResults,
    });
  } catch (error) {
    console.error("Analytics sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
