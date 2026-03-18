import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Map system automation IDs to their API paths
const API_PATHS: Record<string, string> = {
  "sys-daily-report": "/api/cron/daily-report",
  "sys-stage-transitions": "/api/cron/stage-transitions",
  "sys-sales-reminder": "/api/cron/sales-reminder",
  "sys-mentor-reminder": "/api/cron/mentor-reminder",
  "sys-sync-spreadsheets": "/api/cron/sync-automations",
  "sys-weekly-sales-report": "/api/cron/weekly-sales-report",
  "sys-ca-reminder": "/api/cron/ca-reminder",
  "sys-payment-confirm": "/api/cron/payment-confirm",
  "sys-work-status-report": "/api/cron/work-status-report",
  "sys-coaching-consumption-alert": "/api/cron/coaching-consumption-alert",
  "sys-mentor-status-report": "/api/cron/mentor-status-report",
  "sys-student-reminder": "/api/cron/student-reminder",
  "sys-coaching-start-notification": "/api/cron/coaching-start-notification",
};

/**
 * POST /api/system-automations/run
 * システム自動化を手動実行
 * Body: { automationId: string }
 */
export async function POST(request: Request) {
  let body: { automationId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiPath = API_PATHS[body.automationId];
  if (!apiPath) {
    return NextResponse.json({ error: `Unknown automation: ${body.automationId}` }, { status: 400 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  // Build absolute URL from the request
  const url = new URL(apiPath, request.url);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const text = await res.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = { message: text };
    }

    return NextResponse.json({
      automationId: body.automationId,
      status: res.ok ? "success" : "failed",
      httpStatus: res.status,
      result,
    });
  } catch (err) {
    return NextResponse.json({
      automationId: body.automationId,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    }, { status: 500 });
  }
}
