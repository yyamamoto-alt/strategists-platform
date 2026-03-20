import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GOOGLE_ADS_CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID || "9777096652";
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";

const APPLICATION_CV_ACTIONS = ["既卒(/schedule/遷移)", "新卒(schedule_newgraduate_遷移)"];
const MICRO_CV_ACTION = "マイクロCV";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

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

async function adsSearchStream(accessToken: string, query: string) {
  const res = await fetch(
    `https://googleads.googleapis.com/v23/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:searchStream`,
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
    const errText = await res.text().catch(() => "");
    console.error("Google Ads API error:", res.status, errText);
    return null;
  }
  return res.json();
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

/** Split dates into monthly ranges for efficient Google Ads queries */
function splitIntoMonthlyRanges(dates: string[]): { from: string; to: string }[] {
  if (dates.length === 0) return [];

  const ranges: { from: string; to: string }[] = [];
  let rangeStart = dates[0];
  let prevMonth = dates[0].slice(0, 7);

  for (let i = 1; i < dates.length; i++) {
    const curMonth = dates[i].slice(0, 7);
    if (curMonth !== prevMonth) {
      ranges.push({ from: rangeStart, to: dates[i - 1] });
      rangeStart = dates[i];
      prevMonth = curMonth;
    }
  }
  ranges.push({ from: rangeStart, to: dates[dates.length - 1] });
  return ranges;
}

async function syncAdsForRange(
  fromDate: string,
  toDate: string,
  accessToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ campaigns: number; error?: string }> {
  // Campaign daily data
  const campaignData = await adsSearchStream(accessToken, `
    SELECT segments.date, campaign.name, campaign.status,
      metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
      metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date >= '${fromDate}' AND segments.date <= '${toDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date ASC, metrics.cost_micros DESC
  `);

  // Campaign CV breakdown
  const campaignCvData = await adsSearchStream(accessToken, `
    SELECT segments.date, campaign.name, segments.conversion_action_name, metrics.conversions
    FROM campaign
    WHERE segments.date >= '${fromDate}' AND segments.date <= '${toDate}'
      AND campaign.status != 'REMOVED' AND metrics.conversions > 0
  `);

  // Build CV lookup: date|campaign_name -> { cv_application, cv_micro }
  const cvLookup: Record<string, { cv_application: number; cv_micro: number }> = {};
  if (campaignCvData) {
    for (const batch of campaignCvData) {
      for (const result of batch.results || []) {
        const dateStr = result.segments?.date || "";
        const name = result.campaign?.name || "";
        const action = result.segments?.conversionActionName || "";
        const cv = parseFloat(result.metrics?.conversions || "0");
        const key = `${dateStr}|${name}`;
        if (!cvLookup[key]) cvLookup[key] = { cv_application: 0, cv_micro: 0 };
        if (APPLICATION_CV_ACTIONS.includes(action)) cvLookup[key].cv_application += cv;
        else if (action === MICRO_CV_ACTION) cvLookup[key].cv_micro += cv;
      }
    }
  }

  let totalRows = 0;
  if (campaignData) {
    const campaignRows: AnyRow[] = [];
    for (const batch of campaignData) {
      for (const result of batch.results || []) {
        const m = result.metrics;
        const dateStr = result.segments?.date || fromDate;
        const name = result.campaign?.name || "Unknown";
        const key = `${dateStr}|${name}`;
        const cvBreakdown = cvLookup[key] || { cv_application: 0, cv_micro: 0 };
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
      // Upsert in batches of 500 to avoid payload limits
      for (let i = 0; i < campaignRows.length; i += 500) {
        const batch = campaignRows.slice(i, i + 500);
        const { error } = await supabase
          .from("analytics_ads_campaign_daily")
          .upsert(batch, { onConflict: "date,campaign_name" });
        if (error) {
          console.error("Ads campaign upsert error:", error.message);
          return { campaigns: totalRows, error: error.message };
        }
        totalRows += batch.length;
      }
    }
  }

  return { campaigns: totalRows };
}

export async function GET(request: Request) {
  // Auth check
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate params
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  if (!fromParam || !toParam) {
    return NextResponse.json(
      { error: "Both 'from' and 'to' query parameters are required (e.g., ?from=2025-04-01&to=2025-04-30)" },
      { status: 400 }
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromParam) || !/^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }

  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    return NextResponse.json(
      { error: "GOOGLE_ADS_DEVELOPER_TOKEN is not configured" },
      { status: 500 }
    );
  }

  const allDates = datesBetween(fromParam, toParam);
  if (allDates.length === 0) {
    return NextResponse.json({ error: "'from' must be <= 'to'" }, { status: 400 });
  }
  if (allDates.length > 365) {
    return NextResponse.json(
      { error: "Range too large. Max 365 days at a time." },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  try {
    const accessToken = await refreshAccessToken();

    // Split into monthly ranges for efficiency
    const monthlyRanges = splitIntoMonthlyRanges(allDates);
    const results: Record<string, { campaigns: number; error?: string }> = {};

    for (const range of monthlyRanges) {
      try {
        results[`${range.from}_to_${range.to}`] = await syncAdsForRange(
          range.from,
          range.to,
          accessToken,
          supabase
        );
      } catch (rangeError) {
        console.error(`Backfill error for ${range.from} to ${range.to}:`, rangeError);
        results[`${range.from}_to_${range.to}`] = {
          campaigns: 0,
          error: rangeError instanceof Error ? rangeError.message : "Unknown error",
        };
      }
    }

    const totalCampaigns = Object.values(results).reduce((s, r) => s + r.campaigns, 0);

    return NextResponse.json({
      success: true,
      from: fromParam,
      to: toParam,
      total_days: allDates.length,
      monthly_batches: monthlyRanges.length,
      total_campaign_rows: totalCampaigns,
      results,
    });
  } catch (error) {
    console.error("Backfill ads error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
