import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_ORIGIN = "https://akagiconsulting.com";
const MAX_EVENTS = 200;

function corsHeaders(origin?: string | null) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (origin !== ALLOWED_ORIGIN) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  }

  try {
    const body = await req.json();
    const { session_id, page_path, device_type, viewport_w, viewport_h, page_h, lp_version, events } = body;

    if (!session_id || !page_path || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400, headers });
    }

    const trimmed = events.slice(0, MAX_EVENTS);

    const rows = trimmed.map((e: { type: string; x_pct?: number; y_pct?: number; scroll_depth?: number }) => ({
      session_id,
      page_path,
      event_type: e.type === "click" ? "click" : "scroll",
      x_pct: e.type === "click" ? e.x_pct ?? null : null,
      y_pct: e.type === "click" ? e.y_pct ?? null : null,
      scroll_depth: e.type === "scroll" ? e.scroll_depth ?? null : null,
      viewport_w: viewport_w ?? null,
      viewport_h: viewport_h ?? null,
      page_h: page_h ?? null,
      device_type: device_type === "sp" ? "sp" : "pc",
      lp_version: lp_version || "unknown",
    }));

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "server config" }, { status: 500, headers });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase.from("heatmap_events").insert(rows);

    if (error) {
      console.error("[heatmap collect]", error.message);
      return NextResponse.json({ error: "db error" }, { status: 500, headers });
    }

    return NextResponse.json({ ok: true, count: rows.length }, { headers });
  } catch {
    return NextResponse.json({ error: "parse error" }, { status: 400, headers });
  }
}
