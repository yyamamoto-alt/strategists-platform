import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getValidAccessToken, fetchInvoices } from "@/lib/freee";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Load freee settings
  const { data: settings } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "freee_access_token",
      "freee_refresh_token",
      "freee_token_expires_at",
      "freee_company_id",
      "freee_connected",
    ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settingsMap: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (settings || []).forEach((s: any) => {
    settingsMap[s.key] = s.value;
  });

  if (settingsMap.freee_connected !== "true") {
    return NextResponse.json({ error: "freee未連携です。設定画面から連携してください。" }, { status: 400 });
  }

  // Get valid access token (auto-refresh if needed)
  let accessToken: string;
  let refreshToken: string;
  try {
    const result = await getValidAccessToken(
      settingsMap.freee_access_token,
      settingsMap.freee_refresh_token,
      settingsMap.freee_token_expires_at
    );
    accessToken = result.accessToken;
    refreshToken = result.refreshToken;

    // If refreshed, update stored tokens
    if (result.refreshed) {
      const ttlMs = (result.expiresIn || 86400) * 1000;
      const newExpiry = new Date(Date.now() + ttlMs).toISOString();
      const tokenUpdates = [
        { key: "freee_access_token", value: accessToken },
        { key: "freee_refresh_token", value: refreshToken },
        { key: "freee_token_expires_at", value: newExpiry },
      ];
      for (const u of tokenUpdates) {
        await db.from("app_settings").upsert(
          { key: u.key, value: u.value, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      }
    }
  } catch {
    return NextResponse.json({ error: "freeeトークンの更新に失敗しました。再連携してください。" }, { status: 401 });
  }

  const companyId = Number(settingsMap.freee_company_id);

  // Parse optional date range from request body
  let startDate: string | undefined;
  let endDate: string | undefined;
  try {
    const body = await request.json();
    startDate = body.start_date;
    endDate = body.end_date;
  } catch {
    // No body is fine - fetch all
  }

  // Fetch invoices from freee
  const invoices = await fetchInvoices(accessToken, companyId, {
    start_billing_date: startDate,
    end_billing_date: endDate,
  });

  // Sync invoices to other_revenues
  let inserted = 0;
  let skipped = 0;

  for (const inv of invoices) {
    // Skip cancelled invoices
    if (inv.cancel_status === "canceled") {
      skipped++;
      continue;
    }

    // Check if already synced (by description containing invoice number)
    const { data: existing } = await db
      .from("other_revenues")
      .select("id")
      .ilike("description", `%freee:${inv.invoice_number}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    // Use billing_date (請求日) as revenue_date, fallback to payment_date
    const revenueDate = inv.billing_date || inv.payment_date || inv.issue_date;
    if (!revenueDate) {
      skipped++;
      continue;
    }

    // カテゴリ判定: MyVision → myvision、それ以外 → other
    const partnerName = (inv.partner_display_name || inv.partner_name || "").toLowerCase();
    const category = (partnerName.includes("myvision") || partnerName.includes("マイビジョン"))
      ? "myvision"
      : "other";

    const { error } = await db.from("other_revenues").insert({
      category,
      title: `${inv.subject || inv.partner_name || "freee請求書"}`,
      amount: inv.total_amount,
      revenue_date: revenueDate,
      description: `${inv.partner_display_name || inv.partner_name} - ${inv.subject} [freee:${inv.invoice_number}]`,
    });

    if (!error) {
      inserted++;
    }
  }

  return NextResponse.json({
    success: true,
    total_invoices: invoices.length,
    inserted,
    skipped,
  });
}
