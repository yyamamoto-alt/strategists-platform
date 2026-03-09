import "server-only";

const FREEE_TOKEN_URL = "https://accounts.secure.freee.co.jp/public_api/token";
const FREEE_API_BASE = "https://api.freee.co.jp";
const FREEE_IV_API_BASE = "https://api.freee.co.jp/iv";

export function getFreeeConfig() {
  const clientId = process.env.FREEE_CLIENT_ID;
  const clientSecret = process.env.FREEE_CLIENT_SECRET;
  const redirectUri = process.env.FREEE_REDIRECT_URI || "https://strategists-crm.vercel.app/api/freee/callback";

  if (!clientId || !clientSecret) {
    throw new Error("FREEE_CLIENT_ID and FREEE_CLIENT_SECRET are required");
  }

  return { clientId, clientSecret, redirectUri };
}

export async function exchangeCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getFreeeConfig();

  const res = await fetch(FREEE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
    created_at: number;
    company_id?: number;
  }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getFreeeConfig();

  const res = await fetch(FREEE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
    created_at: number;
  }>;
}

export async function getValidAccessToken(
  storedAccessToken: string,
  storedRefreshToken: string,
  expiresAt: string
): Promise<{ accessToken: string; refreshToken: string; refreshed: boolean }> {
  const now = new Date();
  const expiry = new Date(expiresAt);

  // Refresh 5 minutes before expiry
  if (now < new Date(expiry.getTime() - 5 * 60 * 1000)) {
    return { accessToken: storedAccessToken, refreshToken: storedRefreshToken, refreshed: false };
  }

  const tokens = await refreshAccessToken(storedRefreshToken);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    refreshed: true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function freeeApiFetch(accessToken: string, path: string, base = FREEE_API_BASE): Promise<any> {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`freee API error: ${res.status} ${text}`);
  }

  return res.json();
}

export interface FreeeInvoice {
  id: number;
  invoice_number: string;
  subject: string;
  billing_date: string | null;
  issue_date: string | null;
  payment_date: string | null;
  total_amount: number;
  amount_excluding_tax: number;
  amount_tax: number;
  partner_name: string;
  partner_display_name: string;
  sending_status: string;
  payment_status: string;
  cancel_status: string;
  deal_status: string;
}

export async function fetchInvoices(
  accessToken: string,
  companyId: number,
  params?: { start_billing_date?: string; end_billing_date?: string }
): Promise<FreeeInvoice[]> {
  const query = new URLSearchParams({ company_id: String(companyId) });
  if (params?.start_billing_date) query.set("start_billing_date", params.start_billing_date);
  if (params?.end_billing_date) query.set("end_billing_date", params.end_billing_date);

  // freee Invoice API: base URL is /iv
  const data = await freeeApiFetch(accessToken, `/invoices?${query}`, FREEE_IV_API_BASE);
  return data.invoices || [];
}

export async function fetchCompanies(accessToken: string): Promise<{ id: number; name: string; display_name: string }[]> {
  const data = await freeeApiFetch(accessToken, "/api/1/companies");
  return data.companies || [];
}
