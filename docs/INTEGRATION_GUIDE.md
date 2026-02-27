# CRM × LMS 統合セットアップガイド

## 全体フロー

```
Step 1: Supabase プロジェクト作成（共通DB）
    ↓
Step 2: マイグレーション実行（テーブル・RLS作成）
    ↓
Step 3: Custome-DB（CRM）を Supabase に接続
    ↓
Step 4: Strategists（LMS）に shared-db パッケージを取り込み
    ↓
Step 5: LMS を同じ Supabase に接続
    ↓
Step 6: ユーザーロール設定（admin / mentor / student）
    ↓
Step 7: デプロイ（それぞれ別ドメイン）
```

---

## Step 1: Supabase プロジェクト作成

1. https://supabase.com にログイン
2. 「New Project」で **1つだけ** プロジェクトを作成
   - 名前例: `strategy-school`
   - リージョン: `Northeast Asia (Tokyo)`
   - パスワードを安全に保存
3. 作成後、以下をメモ:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon key**: `eyJhbGci...`
   - **service_role key**: `eyJhbGci...`（サーバー側のみ使用）

---

## Step 2: マイグレーション実行

Supabase Dashboard の **SQL Editor** で、以下の順番に実行:

```
supabase/migrations/001_initial_schema.sql   ← CRM基本テーブル
supabase/migrations/002_lms_tables.sql       ← LMS用テーブル
supabase/migrations/003_rls_policies.sql     ← RLSアクセス制御
```

### 実行方法A: Supabase Dashboard
1. Dashboard → SQL Editor → New query
2. 各ファイルの内容をコピペして「Run」

### 実行方法B: Supabase CLI
```bash
# Supabase CLIインストール
npm install -g supabase

# プロジェクトにリンク
supabase link --project-ref xxxxx

# マイグレーション実行
supabase db push
```

### 実行後の確認
Dashboard → Table Editor で以下のテーブルが存在すること:
- ✅ customers, sales_pipeline, contracts, learning_records, agent_records, activities
- ✅ courses, lessons, lesson_progress, coaching_sessions, assignments
- ✅ user_roles

---

## Step 3: Custome-DB（CRM）を接続

```bash
# Custome-DB リポジトリ内で
cp .env.local.example .env.local
```

`.env.local` を編集:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

動作確認:
```bash
npm run dev
# http://localhost:3000 でCRM画面が表示されればOK
```

---

## Step 4: LMS に shared-db を取り込む

### 方法A: ファイルコピー（最も簡単）

```bash
# Strategists リポジトリ内で
mkdir -p packages
cp -r /path/to/Custome-DB/packages/shared-db packages/

# package.json に追加
npm install file:./packages/shared-db
```

### 方法B: Git Submodule（型の同期が自動）

```bash
# Strategists リポジトリ内で
git submodule add https://github.com/yyamamoto-alt/Custome-DB.git vendor/custome-db

# package.json に追加
# "dependencies": {
#   "@strategy-school/shared-db": "file:./vendor/custome-db/packages/shared-db"
# }

npm install
```

### 方法C: npm パッケージとして publish

```bash
# Custome-DB/packages/shared-db 内で
cd packages/shared-db
npm publish --access restricted

# Strategists リポジトリ内で
npm install @strategy-school/shared-db
```

### LMS 側の next.config.js に追加:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@strategy-school/shared-db"],
};
module.exports = nextConfig;
```

---

## Step 5: LMS を同じ Supabase に接続

LMS側の `.env.local`:
```env
# ★ CRMと全く同じURL・キーを使う ★
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

LMS側のSupabaseクライアント:
```typescript
// src/lib/supabase.ts (LMS側)
import { createSharedSupabaseClient } from "@strategy-school/shared-db/client";

export const supabase = createSharedSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

LMS側で型を使う例:
```typescript
import type {
  Course, Lesson, LessonProgress,
  CoachingSession, Assignment
} from "@strategy-school/shared-db";

// コース一覧取得（受講生でも全コース見える）
const { data: courses } = await supabase
  .from("courses")
  .select("*")
  .eq("is_active", true)
  .order("sort_order");

// 自分の進捗取得（RLSで自動フィルタ）
const { data: progress } = await supabase
  .from("lesson_progress")
  .select("*, lessons(*)")
  .order("updated_at", { ascending: false });
```

---

## Step 6: ユーザーロール設定

### 6-1. Supabase Auth を有効化
Dashboard → Authentication → Providers で:
- ✅ Email/Password を有効
- （必要に応じて Google, GitHub 等も）

### 6-2. ユーザー作成後にロールを割り当て

```sql
-- 管理者ユーザーの登録（CRM側で使う）
INSERT INTO user_roles (user_id, role)
VALUES ('auth-user-uuid-here', 'admin');

-- メンターの登録（CRM + LMS 両方で使う）
INSERT INTO user_roles (user_id, role)
VALUES ('mentor-auth-uuid', 'mentor');

-- 受講生の登録（LMS側で使う）
-- customer_id と紐づける
INSERT INTO user_roles (user_id, customer_id, role)
VALUES ('student-auth-uuid', 'customer-uuid-here', 'student');
```

### 6-3. 自動でロール割り当てるトリガー（任意）
```sql
-- 新規ユーザー登録時にデフォルトで student ロールを割り当て
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## Step 7: デプロイ

### CRM（Custome-DB）→ Vercel プロジェクト A
```bash
# Vercel にデプロイ
vercel --prod

# 環境変数を設定（Vercel Dashboard）
# NEXT_PUBLIC_SUPABASE_URL = https://xxxxx.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGci...
```
- ドメイン例: `crm.strategy-school.com`

### LMS（Strategists）→ Vercel プロジェクト B
```bash
vercel --prod

# 同じ環境変数を設定
# NEXT_PUBLIC_SUPABASE_URL = https://xxxxx.supabase.co  ← 同じ！
# NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGci...           ← 同じ！
```
- ドメイン例: `learn.strategy-school.com`

---

## 最終的なアーキテクチャ

```
    crm.strategy-school.com        learn.strategy-school.com
    ┌─────────────────────┐        ┌─────────────────────┐
    │   Custome-DB (CRM)  │        │  Strategists (LMS)  │
    │   Vercel Project A  │        │  Vercel Project B   │
    │                     │        │                     │
    │ ・顧客一覧/カルテ    │        │ ・コース一覧         │
    │ ・営業パイプライン   │        │ ・レッスン受講        │
    │ ・売上ダッシュボード  │        │ ・課題提出           │
    │ ・契約管理          │        │ ・セッション予約      │
    │ ・エージェント管理   │        │ ・学習進捗           │
    └────────┬────────────┘        └────────┬────────────┘
             │                              │
             │  同じ URL / Key              │
             ▼                              ▼
    ┌──────────────────────────────────────────────┐
    │        Supabase (1つのプロジェクト)            │
    │                                              │
    │  ┌── RLS ──────────────────────────────────┐  │
    │  │ admin  → 全テーブル読み書き              │  │
    │  │ mentor → 全テーブル読み書き              │  │
    │  │ student → 自分のデータのみ               │  │
    │  │          (mentor_notes は非表示)         │  │
    │  └─────────────────────────────────────────┘  │
    └──────────────────────────────────────────────┘
```

---

## データの流れ（具体例）

### 新規受講生が入学するとき
1. **CRM側**: 管理者が顧客を登録 → `customers` テーブルに INSERT
2. **CRM側**: 契約を作成 → `contracts` テーブルに INSERT
3. **CRM側**: 受講生のSupabase Authアカウントを作成
4. **自動**: `user_roles` に student ロールが INSERT される
5. **LMS側**: 受講生がログイン → 自分のコースが見える

### 受講生が学習を進めるとき
1. **LMS側**: レッスンを開始 → `lesson_progress` に INSERT (status: '進行中')
2. **LMS側**: レッスン完了 → `lesson_progress` を UPDATE (status: '完了')
3. **CRM側**: 管理者がダッシュボードで進捗を確認 ← 同じテーブルを見る

### メンターがセッションを行うとき
1. **LMS側**: 受講生がセッションを予約 → `coaching_sessions` に INSERT
2. **CRM側**: メンターがセッション記録を追記 → `mentor_notes` を UPDATE
3. **LMS側**: 受講生は `student_coaching_sessions` ビュー経由で閲覧
   → `mentor_notes` は見えない、`student_notes` のみ表示
