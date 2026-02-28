# Strategists Platform - CLAUDE.md

## Project Overview
Strategists (コンサル転職スクール＋人材紹介) の経営管理プラットフォーム。CRM/LMSの2アプリ構成。

## Tech Stack
- **Monorepo**: npm workspaces
- **apps/crm**: Next.js 14 (port 3000) - 管理者向けCRM
- **apps/lms**: Next.js 14 (port 3001) - 受講生向けLMS
- **packages/shared-db**: 共通TypeScript型定義
- **DB**: Supabase (project: plrmqgcigzjuiovsbggf)
- **Deploy**: Vercel via `scripts/deploy.sh [crm|lms|all]`

## URLs
- CRM: https://strategists-crm.vercel.app
- LMS: https://strategists-lms.vercel.app
- GitHub: yyamamoto-alt/strategists-platform

## Supabase Info
- 1,166 real customer records with PII (names, emails, phones, career history, salary)
- Admin user: y.yamamoto@akagiconsulting.com (user_id: d567fe7d-f80c-474f-b874-51ae6339f23a)
- user_roles table with admin role inserted
- RLS applied via `supabase/apply_rls_now.sql` (executed in SQL Editor)

## Security Architecture (COMPLETED)

```
CRM: Browser → middleware(auth) → Server Component → Supabase(service_role key)
     No NEXT_PUBLIC_SUPABASE_* vars. Keys never reach browser.

LMS: Browser → middleware(auth) → Server Component → Supabase(anon key + RLS)
     RLS restricts students to own data only.
```

### Key Security Files
- `apps/crm/src/middleware.ts` - Auth check, redirects to /login
- `apps/crm/src/lib/supabase/server.ts` - `import "server-only"`, service_role client
- `apps/crm/src/lib/supabase/auth-server.ts` - anon key + cookies for auth session
- `apps/crm/src/app/api/auth/login/route.ts` - Login API with cookie buffering pattern
- `apps/crm/src/app/api/auth/logout/route.ts` - Logout API

### Cookie Handling Pattern (IMPORTANT)
Route Handlers must buffer cookies, then set on NextResponse:
```typescript
const cookiesToReturn: { name: string; value: string; options: Record<string, unknown> }[] = [];
// In setAll callback: cookiesToReturn.push({ name, value, options });
// After auth: const response = NextResponse.json({ user, role });
// for (const cookie of cookiesToReturn) { response.cookies.set(...) }
```

### Known Technical Issues
- Supabase TS generics produce `never` for user_roles queries → use `as { data: ... }` assertions
- `NEXT_PUBLIC_USE_MOCK` must be set BEFORE build (build-time inline for client code)
- `export const dynamic = "force-dynamic"` on all CRM pages (prevents prerender errors)
- middleware.ts must be at `src/middleware.ts` (not project root) when using src/ directory
- Use `window.location.href` instead of `router.push` for post-auth redirects

## CRM File Structure
```
apps/crm/src/
├── middleware.ts                    # Auth guard
├── app/
│   ├── layout.tsx                   # Root layout, AuthProvider with server-side session
│   ├── login/page.tsx               # Login page
│   ├── api/auth/{login,logout}/     # Auth API routes
│   └── (main)/
│       ├── layout.tsx               # Sidebar layout
│       ├── dashboard/
│       │   ├── page.tsx             # Server Component (data fetch)
│       │   └── dashboard-client.tsx # Client Component (UI)
│       ├── customers/
│       │   ├── page.tsx / customers-client.tsx
│       │   └── [id]/page.tsx / customer-detail-client.tsx
│       ├── pipeline/page.tsx / pipeline-client.tsx
│       ├── revenue/page.tsx / revenue-client.tsx
│       ├── learning/page.tsx / learning-client.tsx
│       └── agents/page.tsx / agents-client.tsx
├── components/
│   ├── layout/sidebar.tsx           # Nav sidebar with logout
│   └── dashboard/{kpi-cards,revenue-chart,funnel-chart,channel-table,recent-customers}.tsx
├── lib/
│   ├── auth-context.tsx             # AuthProvider (mock/real mode)
│   ├── mock-data.ts                 # Mock data (still present for fallback)
│   ├── data/
│   │   ├── customers.ts            # fetchCustomersWithRelations(), fetchCustomerById()
│   │   ├── dashboard-metrics.ts    # computeFunnelMetrics(), computeRevenueMetrics(), computeChannelMetrics(), fetchDashboardData()
│   │   └── transforms.ts           # Supabase row → UI object transformation
│   └── supabase/
│       ├── server.ts               # service_role client (import "server-only")
│       └── auth-server.ts          # anon key client for auth
└── types/database.ts
```

## Vercel Environment Variables
### CRM (strategists-crm)
```
SUPABASE_URL=https://plrmqgcigzjuiovsbggf.supabase.co
SUPABASE_ANON_KEY=eyJ...  (server-side only, for auth session)
SUPABASE_SERVICE_ROLE_KEY=eyJ...  (server-side only, for data)
NEXT_PUBLIC_USE_MOCK=false
```
### LMS (strategists-lms)
```
NEXT_PUBLIC_SUPABASE_URL=https://plrmqgcigzjuiovsbggf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_USE_MOCK=true  (still in mock mode)
```

## Deploy
```bash
bash scripts/deploy.sh crm   # or lms, or all
```

---

## CURRENT TASK: Phase 2 - Revenue System & Dashboard Enhancement

### Background
Phase 1 (security hardening + real data connection) is COMPLETE and deployed.
Phase 2 focuses on bringing the CRM's analytics up to parity with the original Excel spreadsheet ("経営管理(旧_売上管理) (1).xlsx").

### Original Excel Structure (91 sheets, key ones below)
The original management spreadsheet had sophisticated revenue tracking that the current CRM lacks.

#### Key Sheets
1. **顧客DB(new)** - 141 columns per customer (all migrated to Supabase)
2. **PL(実績計画)** - Monthly P&L with revenue formulas
3. **Dashboard** - Visual KPI charts
4. **Quarterly** - Quarterly revenue summaries

#### Excel Revenue Model (from PL sheet)
The Excel tracks revenue in a 3-tier structure:

**Tier 1: 売上 (Total Revenue including agent projections)**
```
売上 = 既卒売上(スクール確定+人材見込) + 新卒売上 + その他売上
既卒売上 = 成約数 × LTV(スクール確定分+人材見込分)
```

**Tier 2: 確定売上 (Confirmed Revenue)**
```
確定売上 = 既卒スクール確定 + 新卒売上 + 人材確定分 + その他
既卒スクール確定 = 成約数 × LTV(スクール確定分のみ)
人材確定分 = SUMIFS(人材見込売上, 人材確定="確定") ← Col EK
```

**Tier 3: 予測売上 (Forecasted Revenue - not yet in current CRM)**
Based on pipeline conversion rates and current month applications.

#### Key Excel Formulas (顧客DB)
- **Col N (売上見込)**: `=AK2+BU2+EJ2` → 確定売上 + 人材見込売上 + 補助金額
- **Col BU (人材見込売上)**: Complex conditional - only for 成約 customers who are still 受講中, NOT 卒業/受講終了. Calculated as expected agent revenue.
- **Col DX (人材紹介報酬期待値)**: `=想定年収(CA) × 入社至る率(BY) × 内定確度(BZ) × 紹介料率(CB) × マージン(CC)`
- **Col DD (見込LTV)**: `=IF(売上見込=0, デフォルトLTV × 成約見込率, 売上見込)` where default LTV is 427,636 for 既卒, 240,000 for 新卒
- **Col DE (見込LTV月消化率考慮)**: Adjusts DD for partial-month progress
- **Col EJ (補助金額)**: `=IF(リスキャリ補助金対象="対象", 203636, 0)`

#### LTV Calculations (PL Sheet Row 138-139)
- **LTV(スクール確定分)** = `SUMIFS(確定売上列, 登録月, 属性="既卒") / 成約数`
- **LTV(スクール確定+人材見込)** = `SUMIFS(売上見込列, 登録月, 属性="既卒") / 成約数`

### Current Data State in Supabase
- 1,166 customers
- ALL `agent_service_enrolled = false` (migration didn't set this)
- ALL `billing_status = "未請求"` (across 929 contracts)
- `expected_referral_fee` total: 217M yen (formula-based defaults: hire_rate=0.6, offer_probability=0.3, referral_fee_rate=0.3)
- Contracts `confirmed_amount`: 59.28M yen (312 contracts)
- Pipeline `projected_amount`: 76.18M yen (318 deals)
- Payments: 1,209 records, 47.45M yen, only 51% linked to customers
- Bank transfers: 927 records, only 7.7% linked to customers
- Many calculated fields (残指導回数, 日程消化率, etc.) were NOT migrated (they were formulas in Excel)

### What the User Wants Built

#### 1. Agent Revenue System (エージェント売上管理)
Two components:
- **見込み (Projected)**: Calculate expected agent revenue from base data. Customers are binary - either using agent service or not. Formula: `想定年収 × 入社至る率 × 内定確度 × 紹介料率 × マージン`
- **確定 (Confirmed)**: Final confirmed agent revenue, managed separately (Col EK = "確定" flag in Excel)

#### 2. Three Revenue Chart Types for Dashboard
1. **確定売上 (Confirmed)**: Only fully confirmed, received revenue
2. **見込み含む売上 (Including agent projections)**: Confirmed + projected agent revenue for enrolled customers
3. **予測売上 (Forecasted)**: Based on current pipeline, conversion rates, and recent applications - projecting ultimate revenue

#### 3. Quarterly Forecast (四半期予測)
Similar to the Excel's Quarterly sheet - quarterly revenue summaries and projections.

### Key Files to Modify
- `apps/crm/src/lib/data/dashboard-metrics.ts` - Revenue calculation logic (currently basic)
- `apps/crm/src/components/dashboard/revenue-chart.tsx` - Revenue chart component
- `apps/crm/src/app/(main)/dashboard/page.tsx` - Dashboard data fetching
- `apps/crm/src/app/(main)/agents/page.tsx` - Agent management page
- `packages/shared-db/src/types.ts` - Type definitions for new metrics

### Data Sources for Revenue Calculation
All data is in Supabase, accessible via `createServiceClient()` in `apps/crm/src/lib/supabase/server.ts`.

Key tables and columns:
- `customers.application_date` - For monthly grouping
- `customers.attribute` - "既卒" vs "新卒" segmentation
- `contracts.confirmed_amount` - Confirmed school revenue
- `contracts.billing_status` - Payment status
- `sales_pipeline.projected_amount` - Pipeline projected amount
- `sales_pipeline.stage` - Deal stage (問い合わせ→成約→入金済)
- `agent_records.expected_referral_fee` - Agent revenue expectation
- `agent_records.offer_salary`, `hire_rate`, `offer_probability`, `referral_fee_rate`, `margin` - Agent revenue formula inputs
- `agent_records.placement_confirmed` - 確定 flag (Col EK in Excel)
- `payments.amount` - Actual payment amounts
- `bank_transfers.amount` - Bank transfer amounts

### Migration Script Reference
`scripts/migrate-from-excel.py` - Maps 141 Excel columns to Supabase tables. Key mapping constants: CUSTOMER_MAPPING, PIPELINE_MAPPING, CONTRACT_MAPPING, LEARNING_MAPPING, AGENT_MAPPING.

---

## Communication
- Language: Japanese preferred
- The user is the business owner (山本さん) who deeply understands the Excel formulas
- Be precise about revenue calculations - this is the core business intelligence
