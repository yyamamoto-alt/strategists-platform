# Strategists Platform コードレビュー・整備レポート

**日付**: 2026-03-10
**対象**: `apps/crm` (164ファイル, ~31,000行) + `apps/lms` (103ファイル) + `packages/shared-db`
**レビュー手法**: 6つの専門エージェント（CRM, LMS, API, セキュリティ, 共有パッケージ）+ 手動調査

---

## 目次
1. [セキュリティリスク（緊急度順）](#1-セキュリティリスク)
2. [バグリスク（本番影響）](#2-バグリスク)
3. [デッドコード・不要ファイル](#3-デッドコード不要ファイル)
4. [コード品質・型安全性](#4-コード品質型安全性)
5. [アーキテクチャ上の問題](#5-アーキテクチャ上の問題)
6. [今後の開発効率化の提案](#6-今後の開発効率化の提案)
7. [対応優先度マトリクス](#7-対応優先度マトリクス)
8. [ハッカーの視点から見た攻撃面](#8-ハッカーの視点)

---

## 1. セキュリティリスク

### 🔴 CRITICAL

#### 1-1. `.env.vercel-check` がGitに追跡されている
**ファイル**: `.env.vercel-check`（Git tracked）
Vercel OIDCトークン（JWT）が含まれたファイルがGitにコミットされている。トークン自体は短命（exp付き）で既に失効済みだが、Git履歴に永続残存。
**対策**: `git rm --cached .env.vercel-check` で追跡を外し、`.gitignore`に追加。

#### 1-2. Jicoo Webhook署名不一致時に処理続行
**ファイル**: `apps/crm/src/app/api/webhooks/jicoo/route.ts:162-164`
```typescript
if (sig !== expected) {
  console.warn("Jicoo signature mismatch, skipping verification");
  // ← 処理が続行される！returnしていない！
}
```
**リスク**: 攻撃者が偽のJicoo予約通知を送り込み、顧客レコードを自動作成・営業パイプラインを改ざん可能。
**対策**: `return NextResponse.json({ error: "Invalid signature" }, { status: 401 });`

#### 1-3. Apps Webhook署名検証がオプショナル
**ファイル**: `apps/crm/src/app/api/webhooks/apps/route.ts:23`
```typescript
if (secret && signature) {  // ← secretが未設定なら検証スキップ！
```
**リスク**: `APPS_WEBHOOK_SECRET`環境変数が未設定の場合、誰でもWebhookを叩いて偽の決済データを挿入可能。
**対策**: `if (!secret) return 500`, `if (!signature) return 401` で両方必須に。

#### 1-4. LMS Enrollment Webhook認証がオプショナル
**ファイル**: `apps/lms/src/app/api/webhook/enrollment/route.ts:37`
```typescript
if (expectedSecret && webhook_secret !== expectedSecret) {  // 同じパターン
```
**リスク**: `WEBHOOK_SECRET`未設定なら任意の入塾申請を作成可能。

#### 1-5. CRM `/api/spreadsheets` がミドルウェアで認証バイパス
**ファイル**: `apps/crm/src/middleware.ts:5`
```typescript
const PUBLIC_PATHS = [..., "/api/spreadsheets", ...];
```
**リスク**: スプレッドシートの全CRUD操作が認証なしでアクセス可能。Google Sheetsの連携設定、プレビュー、同期がすべて外部から実行可能。
**対策**: `/api/spreadsheets`をPUBLIC_PATHSから削除。

### 🟠 HIGH

#### 1-6. `/api/freee/debug` デバッグエンドポイントが本番に存在
**ファイル**: `apps/crm/src/app/api/freee/debug/route.ts`
freeeのAPIレスポンス構造を露出。認証は必要だが本番には不要。
**対策**: 削除する。

#### 1-7. Rate Limitingが一切ない
全APIルートにレート制限なし。特に危険：
- `/api/auth/login` — ブルートフォース攻撃
- `/api/users/accept-invite` — パブリックエンドポイント
- `/api/insights/generate` — Anthropic API呼び出し（コスト攻撃リスク）
**対策**: `@upstash/ratelimit`等でレート制限を実装。

#### 1-8. エラーレスポンスに内部情報が漏洩
**例**: `apps/crm/src/app/api/insights/generate/route.ts:204`
```typescript
detail: error instanceof Error ? error.message : String(error),
```
**対策**: 本番環境ではエラー詳細をログのみに制限。

#### 1-9. LMSアバターアップロードにファイルサイズ制限なし
**ファイル**: `apps/lms/src/app/api/avatar/route.ts`
ファイルサイズのバリデーションがなく、巨大ファイルのアップロードが可能。
**対策**: `if (file.size > 5 * 1024 * 1024) return 400`

### 🟡 MEDIUM

#### 1-10. CSRFトークンがない
CRMのPOST/PATCH/DELETEリクエストにCSRF保護がない。cookie認証を使っているため、CSRF攻撃のリスクあり。

#### 1-11. LMS Slack Action Webhookの署名検証がオプショナル
**ファイル**: `apps/lms/src/app/api/webhook/slack-action/route.ts:14-39`
`SLACK_SIGNING_SECRET`が未設定なら署名検証スキップ。同じパターン。

#### 1-12. LMS admin APIルートの一部で認証チェック欠如
**影響ルート**: `/api/admin/contents*`, `/api/admin/courses*`, `/api/admin/forms*`, `/api/admin/invite`
ミドルウェアで`/api/admin/*`パスはadmin/mentorチェックされるため実害は限定的だが、多層防御の観点から各ルート内でもチェック推奨。

#### 1-13. SQL文字列構築（低リスク）
**ファイル**: `apps/crm/src/app/api/spreadsheets/add-column/route.ts:40`
```typescript
sql: `SELECT ... WHERE table_name = '${table}' AND column_name = '${column_name}'`
```
テーブル名ホワイトリスト + カラム名正規表現バリデーション（`/^[a-z][a-z0-9_]{1,62}$/`）により実質リスクは低いが、ベストプラクティスとしてパラメータ化推奨。

---

## 2. バグリスク

### 🔴 CRITICAL

#### 2-1. 顧客作成時のレースコンディション（データ不整合）
**ファイル**: `apps/crm/src/app/api/customers/route.ts:68-80`
```typescript
const initPromises = [
  db.from("sales_pipeline").insert({...}),
  db.from("contracts").insert({...}),
  db.from("learning_records").insert({...}),
  db.from("agent_records").insert({...}),
];
await Promise.all(initPromises);  // 1つ失敗しても他は成功→孤児レコード
```
**影響**: 4つのinsertのうち1つが失敗すると、残り3つは成功しDB不整合。ロールバックなし。
**対策**: Supabase RPCでトランザクション化。

#### 2-2. `accept-invite`でユーザー全件取得（ページネーション未対応）
**ファイル**: `apps/crm/src/app/api/users/accept-invite/route.ts:75`
```typescript
const { data: users } = await supabase.auth.admin.listUsers();
const existingUser = users?.users?.find((u) => u.email === invitation.email);
```
`listUsers()`はデフォルト50件/ページ。50件超のユーザーが存在すると該当ユーザーが見つからずバグ。

#### 2-3. LMS: レッスン進捗のレースコンディション
**ファイル**: `apps/lms/src/app/(main)/courses/[slug]/learn/[lessonId]/lesson-player-client.tsx:114-117`
ユーザーがレッスン完了→API送信→その間に親コンポーネントのSSRデータで上書き→進捗が巻き戻る。
**対策**: 楽観的更新（optimistic update）パターンに変更。

#### 2-4. LMS: Slack メンバー検索のNull Pointer
**ファイル**: `apps/lms/src/lib/slack.ts:385`
```typescript
const found = membersData.members.find(...)  // membersがundefinedならクラッシュ
```
**対策**: `(membersData?.members || []).find(...)`

### 🟠 HIGH

#### 2-5. Silent Promise Rejection
**ファイル**: `apps/crm/src/lib/customer-matching.ts:554`
```typescript
computeAttributionForCustomer(match.customer_id).catch(() => {});  // サイレント失敗
```
顧客作成は成功するがアトリビューション計算がサイレントに失敗→マーケティング分析に欠損。

#### 2-6. `matchCustomer`の引数不一致
`webhooks/apps/route.ts`と`webhooks/stripe/route.ts`では4引数、`orders/ingest/route.ts`では2引数で呼び出し。

#### 2-7. LMS: メンター重複登録のレースコンディション
**ファイル**: `apps/lms/src/app/api/admin/student-mentors/route.ts`
Check-then-insert パターン（TOCTOU）。
**対策**: DB側にUNIQUE制約追加。

#### 2-8. LMS: Slack Webhookレスポンスの非同期処理
**ファイル**: `apps/lms/src/app/api/webhook/slack-action/route.ts:352`
```typescript
fetch(payload.response_url, {...}).catch(console.error); // awaitされていない
return new Response("", { status: 200 }); // 先にレスポンス返却
```
Slackメッセージ更新がキャンセルされることがある。

---

## 3. デッドコード・不要ファイル

### 削除推奨

| ファイル/コード | 行数 | 理由 |
|----------------|------|------|
| `apps/crm/src/lib/mock-data.ts` | 888行 | CRM本番は`USE_MOCK=false`。12箇所のuseMock分岐もデッドコード |
| `apps/crm/src/app/api/freee/debug/route.ts` | 100行 | デバッグ用。本番不要 |
| `.env.vercel-check` | - | Git追跡中。削除必要 |
| CRM `useMock`分岐（12箇所以上） | ~50行 | 常にfalseの条件分岐 |
| `apps/lms/src/lib/content-utils.ts` `cleanNotionMarkdown()` | 9行 | 未使用関数（Notion連携の残骸） |
| CRM `react-is` 依存 | - | package.jsonに記載あるがコード内で未使用 |
| LMS ビデオURL解析の重複 | ~60行 | `content-utils.ts`と`video-player.tsx`に同一関数 |

---

## 4. コード品質・型安全性

### 🔴 最大の問題: `as any` が177箇所

#### 根本原因
`packages/shared-db/src/types.ts`の`Database`インターフェースに以下のテーブルが未定義：

`orders`, `app_settings`, `enrollment_applications`, `invitations`, `unmatched_records`, `ai_insights`, `notification_logs`, `customer_emails`, `channel_attributions`, `marketing_channels`, `marketing_rules`, `automation_rules`, `automation_logs`, `other_revenues`, `coaching_reports`, `form_submissions`, `spreadsheet_configs`, `contents`, `content_plan_access`, `mentors`, `student_mentors`, `progress_sheets` 他多数

**対策**: `supabase gen types typescript`で自動生成し、`as any`を排除。

### ESLint未設定
プロジェクトレベルでESLint設定ファイルなし。`eslint-disable`が163箇所。

### `console.log/error/warn` が121箇所
ログレベル管理なし。本番環境でconsole.logが実行。

### CSSクラス文字列の重複（LMS）
`rich-editor.tsx`, `rich-content-viewer.tsx`, `markdown-viewer.tsx`の3ファイルで250文字超のTailwind proseクラスが重複。

### Cookie処理パターンの重複（LMS）
4箇所で同一のSupabase SSR cookieバッファパターンが重複。共通ユーティリティに抽出可能。

---

## 5. アーキテクチャ上の問題

### 5-1. Webhook処理の重複
3ファイル（apps/stripe/ingest）で「ノーマライズ→マッチング→upsert→Slack通知」が重複。

### 5-2. `lib/data/`ディレクトリの肥大化
12ファイル以上。各ファイルがSupabase直接クエリ+ビジネスロジックを混在。

### 5-3. 歴史データのハードコード
**ファイル**: `apps/crm/src/lib/data/note-sales.ts`
14ヶ月分のnote売上データがコード内にハードコード。修正にはデプロイが必要。

### 5-4. AI Insightsのカテゴリ移行が不完全
`apps/crm/src/lib/data/insights.ts`で新旧カテゴリのフォールバックロジックが残存。

### 5-5. `deploy.sh`の動的vercel.json生成
デプロイ時にvercel.jsonを動的生成→削除。並行デプロイ時にレースコンディション。

### 5-6. Next.js設定の不一致
LMSには`optimizePackageImports`と`images.formats`の設定があるがCRMにはない。

---

## 6. 今後の開発効率化の提案

### 優先度A（すぐやるべき）

1. **セキュリティ修正**（1-2時間）
   - Webhook署名検証の必須化（3ファイル修正）
   - `/api/spreadsheets`のPUBLIC_PATHS除外
   - `.env.vercel-check`のGit追跡解除
   - freee debugエンドポイント削除

2. **Database型定義の完全化**（3-4時間）
   - `supabase gen types typescript`で自動生成
   - `as any` 177箇所を解消

3. **CRMからモックコード完全削除**（1時間）
   - `mock-data.ts`削除 + 12箇所のuseMock分岐削除

### 優先度B（1-2週間以内）

4. **ESLint + Prettier設定**（1時間）
5. **API認証・エラーハンドリングヘルパー統一**（2-3時間）
6. **顧客作成のトランザクション化**（2時間）
7. **LMSの進捗追跡レースコンディション修正**（2時間）
8. **accept-invite の listUsers 修正**（15分）

### 優先度C（余裕のある時）

9. Webhook処理の共通化
10. ログユーティリティ導入
11. テスト追加（現在0件）
12. CSS/Cookieパターンの重複排除
13. note売上データのDB移行

---

## 7. 対応優先度マトリクス

| 優先度 | タスク | カテゴリ | 工数 |
|--------|--------|----------|------|
| 🔴 緊急 | Jicoo Webhook署名不一致時にreturn追加 | セキュリティ | 5分 |
| 🔴 緊急 | Apps Webhook署名を必須に | セキュリティ | 5分 |
| 🔴 緊急 | LMS Enrollment Webhook署名を必須に | セキュリティ | 5分 |
| 🔴 緊急 | `/api/spreadsheets`をPUBLIC_PATHSから削除 | セキュリティ | 5分 |
| 🔴 緊急 | `.env.vercel-check`のGit追跡解除 | セキュリティ | 5分 |
| 🟠 高 | 顧客作成のトランザクション化 | バグ防止 | 2時間 |
| 🟠 高 | accept-inviteのlistUsers修正 | バグ | 15分 |
| 🟠 高 | LMS Slack null pointer修正 | バグ | 5分 |
| 🟠 高 | freee debugエンドポイント削除 | セキュリティ | 5分 |
| 🟠 高 | ファイルアップロードサイズ制限追加 | セキュリティ | 15分 |
| 🟠 高 | ログインAPIにレート制限追加 | セキュリティ | 1時間 |
| 🟡 中 | Database型定義の完全化 | 品質 | 3-4時間 |
| 🟡 中 | ESLint設定追加 | 品質 | 1時間 |
| 🟡 中 | CRMモックコード削除 | 品質 | 1時間 |
| 🟡 中 | react-is依存の削除 | 品質 | 5分 |
| 🔵 低 | Webhook処理共通化 | 保守性 | 2時間 |
| 🔵 低 | テスト追加 | 品質 | 継続的 |

---

## 8. ハッカーの視点

もし攻撃者がこのシステムを狙うなら：

### 攻撃シナリオ1: スプレッドシートAPI経由のデータ漏洩
```
GET https://strategists-crm.vercel.app/api/spreadsheets → 認証なしでスプレッドシート設定一覧取得
GET /api/spreadsheets/{id}/preview → Google Sheetsの顧客データプレビュー取得
```
**難易度**: 極めて低（URLを知っていれば誰でも）

### 攻撃シナリオ2: Jicoo Webhook偽装
```bash
curl -X POST https://strategists-crm.vercel.app/api/webhooks/jicoo \
  -H "Content-Type: application/json" \
  -d '{"event":"booking.created","object":{"name":"攻撃者","email":"attacker@evil.com"}}'
# → 署名不一致でもwarnだけで処理続行→偽の顧客レコード作成
```
**難易度**: 低（署名検証が無効化されている）

### 攻撃シナリオ3: Apps決済偽装
```bash
curl -X POST https://strategists-crm.vercel.app/api/webhooks/apps \
  -H "Content-Type: application/json" \
  -d '{"event":"payment_success","contact_name":"偽","amount":999999}'
# → APPS_WEBHOOK_SECRET未設定なら署名検証スキップ
```

### 攻撃シナリオ4: ブルートフォース
```bash
for pass in $(cat wordlist.txt); do
  curl -X POST /api/auth/login -d "{\"email\":\"y.yamamoto@akagiconsulting.com\",\"password\":\"$pass\"}"
done
# → レート制限なし
```

### 攻撃シナリオ5: CSRF
管理者がログイン中に悪意のあるサイトを開かせ、hidden formでCRM APIにPOSTリクエスト。cookie認証がそのまま送信され、顧客データの変更・削除が可能。

### 防御強化の推奨事項
1. 全Webhook署名検証を必須化（最優先）
2. `/api/spreadsheets`の認証追加
3. ログインAPIにレート制限
4. Vercel Web Application Firewall (WAF) の検討
5. Content-Security-Policyヘッダーの設定
6. Supabase RLSポリシーの定期的な監査

---

## 全体評価

### 良い点
- TypeScriptの採用（コンパイルエラーゼロ）
- Monorepo構造が整然（npm workspaces）
- CRM/LMSの適切な分離
- Cronジョブの認証（CRON_SECRET）
- Stripe Webhookの署名検証は堅実
- 依存関係のバージョン一致（React, Next.js, Supabase）

### 改善が必要な点
- `as any` 177箇所（型安全性の喪失）
- セキュリティ: Webhook署名検証の不備（3箇所）
- テスト0件
- ESLint未設定
- エラーハンドリングの不統一
- モックコードの残存

### 総合スコア: 6.5/10
機能的には動作しているが、セキュリティとコード品質の両面で重要な改善が必要。セキュリティ修正（数時間の作業）で8/10に向上可能。

---

*このレポートは6つの専門エージェント + 手動調査によるClaude Codeの自動レビューです。*
*セキュリティ修正は山本さんの確認後に即座に実施推奨。*
