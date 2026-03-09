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
): Promise<{ accessToken: string; refreshToken: string; refreshed: boolean; expiresIn: number }> {
  const now = new Date();
  const expiry = new Date(expiresAt);

  // Refresh 5 minutes before expiry
  if (now < new Date(expiry.getTime() - 5 * 60 * 1000)) {
    return { accessToken: storedAccessToken, refreshToken: storedRefreshToken, refreshed: false, expiresIn: 0 };
  }

  console.log("[freee] Access token expired, refreshing...");
  const tokens = await refreshAccessToken(storedRefreshToken);
  console.log("[freee] Token refreshed, expires_in:", tokens.expires_in);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    refreshed: true,
    expiresIn: tokens.expires_in,
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
  revenue: number; // 売上高
  cost_of_sales: number; // 売上原価
  sga: number; // 販売管理費（販管費）
}

/** freee勘定科目の内訳（販管費の詳細） */
export interface FreeePLDetail {
  period: string;
  items: { name: string; amount: number }[];
}

/**
 * freee試算表から特定月の累計P/Lを取得
 */
async function fetchTrialPLForMonth(
  accessToken: string,
  companyId: number,
  fiscalYear: number,
  month: number,
): Promise<{ revenue: number; cost_of_sales: number; sga: number; sgaItems: { name: string; amount: number }[] }> {
  const data = await freeeApiFetch(
    accessToken,
    `/api/1/reports/trial_pl?company_id=${companyId}&fiscal_year=${fiscalYear}&start_month=${month}&end_month=${month}`,
  );

  const balances = data?.trial_pl?.balances || [];
  let revenue = 0;
  let cost_of_sales = 0;
  let sga = 0;
  const sgaItems: { name: string; amount: number }[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of balances as any[]) {
    const cat = item.account_category_name as string;
    const totalLine = !!item.total_line;
    const level = item.hierarchy_level as number;
    const closing = Number(item.closing_balance || 0);
    const name = item.account_item_name as string | undefined;

    if (totalLine && cat === "売上高" && level === 1) {
      revenue = closing;
    } else if (totalLine && cat === "売上原価" && level === 2) {
      cost_of_sales = closing;
    } else if (totalLine && (cat === "販売管理費" || cat === "販売費及び一般管理費") && level === 2) {
      sga = closing;
    } else if (!totalLine && name && (cat === "販売管理費" || cat === "販売費及び一般管理費")) {
      if (closing !== 0) {
        sgaItems.push({ name, amount: closing });
      }
    }
  }

  return { revenue, cost_of_sales, sga, sgaItems };
}

/**
 * freee 試算表(P/L)から月別の原価・販管費を取得
 * freee APIは累計値を返すため、差分計算で月次データを生成
 * 会計年度は4月始まり（4,5,...,12,1,2,3月の順）
 */
export async function fetchTrialPL(
  accessToken: string,
  companyId: number,
  fiscalYear: number,
): Promise<{ monthly: FreeePLMonthly[]; details: FreeePLDetail[] }> {
  // 会計年度の月順: 4月→翌3月
  const monthOrder = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  const results: FreeePLMonthly[] = [];
  const details: FreeePLDetail[] = [];

  let prevRev = 0;
  let prevCost = 0;
  let prevSga = 0;

  for (const m of monthOrder) {
    try {
      const cumulative = await fetchTrialPLForMonth(accessToken, companyId, fiscalYear, m);

      // 累計→月次: 差分計算（初月はそのまま）
      const monthlyRev = m === 4 ? cumulative.revenue : cumulative.revenue - prevRev;
      const monthlyCost = m === 4 ? cumulative.cost_of_sales : cumulative.cost_of_sales - prevCost;
      const monthlySga = m === 4 ? cumulative.sga : cumulative.sga - prevSga;

      const year = m >= 4 ? fiscalYear : fiscalYear + 1;
      const period = `${year}/${String(m).padStart(2, "0")}`;

      results.push({
        period,
        revenue: monthlyRev,
        cost_of_sales: monthlyCost,
        sga: monthlySga,
      });

      // 販管費内訳も差分で計算するのは難しいので累計のまま保持
      // (詳細は累計値のみ - チャートでは月次合計を使う)
      if (cumulative.sgaItems.length > 0) {
        details.push({ period, items: cumulative.sgaItems });
      }

      prevRev = cumulative.revenue;
      prevCost = cumulative.cost_of_sales;
      prevSga = cumulative.sga;
    } catch (e) {
      // 未来の月は404等でスキップ、認証エラーはthrow
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[freee PL] Month ${m} of FY${fiscalYear} failed: ${msg}`);
      if (msg.includes("401") || msg.includes("403")) {
        throw e;
      }
    }
  }

  return { monthly: results, details };
}

/**
 * freee試算表から月別P/Lデータを取得（複数年度対応）
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
      const { monthly } = await fetchTrialPL(accessToken, companyId, year);
      all.push(...monthly);
    } catch (e) {
      console.error(`[freee PL] fetchTrialPL failed for year ${year}:`, e instanceof Error ? e.message : e);
      // APIエラー（認証失敗等）はthrowして呼び出し元に伝搬させる
      if (e instanceof Error && (e.message.includes("401") || e.message.includes("403"))) {
        throw e;
      }
    }
  }
  // 0値のみの月を除外
  return all.filter((d) => d.revenue !== 0 || d.cost_of_sales !== 0 || d.sga !== 0);
}
