import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchCompanies } from "@/lib/freee";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/settings?freee=error&reason=no_code", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Get company info
    const companies = await fetchCompanies(tokens.access_token);
    const companyId = tokens.company_id || companies[0]?.id;
    const companyName = companies.find((c) => c.id === companyId)?.display_name || "";

    // Store tokens in app_settings
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const settings = [
      { key: "freee_access_token", value: tokens.access_token },
      { key: "freee_refresh_token", value: tokens.refresh_token },
      { key: "freee_token_expires_at", value: expiresAt },
      { key: "freee_company_id", value: String(companyId) },
      { key: "freee_company_name", value: companyName },
      { key: "freee_connected", value: "true" },
    ];

    for (const s of settings) {
      await db
        .from("app_settings")
        .upsert({ key: s.key, value: s.value }, { onConflict: "key" });
    }

    return NextResponse.redirect(new URL("/settings?freee=connected", request.url));
  } catch (err) {
    console.error("freee OAuth error:", err);
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(
      new URL(`/settings?freee=error&reason=${encodeURIComponent(message)}`, request.url)
    );
  }
}
