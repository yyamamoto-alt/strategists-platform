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

// ================================================================
// P&L（損益計算書）取得
// ================================================================

export interface FreeePLMonthly {
  period: string; // YYYY/MM
  cost_of_sales: number; // 売上原価
  sga: number; // 販売管理費（販管費）
}

/**
 * freee 試算表(P/L)から月別の原価・販管費を取得
 * 対象会計年度の各月データを返す
 */
export async function fetchTrialPL(
  accessToken: string,
  companyId: number,
  fiscalYear: number,
): Promise<FreeePLMonthly[]> {
  // freee trial_pl API: 月別内訳を取得
  const data = await freeeApiFetch(
    accessToken,
    `/api/1/reports/trial_pl?company_id=${companyId}&fiscal_year=${fiscalYear}&breakdown_display_type=partner`,
  );

  const balances = data?.balances || [];
  const results: FreeePLMonthly[] = [];

  // 12ヶ月分を初期化
  for (let m = 1; m <= 12; m++) {
    results.push({
      period: `${fiscalYear}/${String(m).padStart(2, "0")}`,
      cost_of_sales: 0,
      sga: 0,
    });
  }

  // freeeの勘定科目カテゴリ:
  // account_category_name: "売上原価" → cost_of_sales
  // account_category_name: "販売費及び一般管理費" → sga
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of balances as any[]) {
    const category = item.account_category_name as string;
    const isCost = category === "売上原価";
    const isSga = category === "販売費及び一般管理費";
    if (!isCost && !isSga) continue;

    // 月次データは items 内の各月 closing_balance
    // or 直接 monthly_balances
    const monthly = item.monthly_balances || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const mb of monthly as any[]) {
      const month = mb.month as number; // 1-12
      const amount = Math.abs(Number(mb.closing_balance || 0));
      const idx = month - 1;
      if (idx >= 0 && idx < 12) {
        if (isCost) results[idx].cost_of_sales += amount;
        if (isSga) results[idx].sga += amount;
      }
    }
  }

  return results;
}

/**
 * freee試算表から月別P/Lデータを取得（複数年度対応）
 * start/end期間をカバーするように複数年度を取得
 */
export async function fetchMonthlyPL(
  accessToken: string,
  companyId: number,
  startYear: number,
  endYear: number,
): Promise<FreeePLMonthly[]> {
  const all: FreeePLMonthly[] = [];
  for (let year = startYear; year <= endYear; year++) {
    try {
      const yearly = await fetchTrialPL(accessToken, companyId, year);
      all.push(...yearly);
    } catch {
      // 年度データなければスキップ
    }
  }
  return all;
}
