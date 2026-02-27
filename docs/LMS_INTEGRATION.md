# CRM / LMS 統合アーキテクチャ

## 概要

```
┌──────────────────────────────────────────────────┐
│              Supabase (共通DB)                    │
│                                                  │
│  ┌─ CRM専用 ──────────┐  ┌─ LMS専用 ──────────┐  │
│  │ sales_pipeline     │  │ courses            │  │
│  │ agent_records      │  │ lessons            │  │
│  │ activities         │  │ lesson_progress    │  │
│  └────────────────────┘  │ coaching_sessions  │  │
│                          │ assignments        │  │
│  ┌─ 共用 ─────────────┐  └────────────────────┘  │
│  │ customers          │                          │
│  │ contracts          │  ┌─ 認証 ──────────────┐  │
│  │ learning_records   │  │ user_roles (RLS)   │  │
│  └────────────────────┘  └────────────────────┘  │
└──────────┬───────────────────────┬────────────────┘
           │                       │
    ┌──────┴──────┐         ┌──────┴──────┐
    │  Custome-DB │         │  LMS Repo   │
    │ (本リポ)     │         │ (別リポ)     │
    │             │         │             │
    │ 管理者向け   │         │ 受講生向け   │
    │ CRM/営業    │         │ 学習/教材   │
    │ KPI/P&L    │         │ 課題提出    │
    │ 顧客カルテ  │         │ セッション予約│
    └─────────────┘         └─────────────┘
```

## 共有パッケージ

`packages/shared-db/` にDB型定義とSupabaseクライアントを配置。

### LMSリポジトリでの使い方

```bash
# LMSリポジトリの package.json に追加
# 方法1: git submodule として shared-db を参照
git submodule add <custome-db-repo-url> packages/shared-db-source
npm install file:./packages/shared-db-source/packages/shared-db

# 方法2: npm private registry に publish
npm publish --access restricted  # shared-db を publish
npm install @strategy-school/shared-db  # LMS側で install

# 方法3: 直接コピー（最もシンプル）
cp -r <custome-db>/packages/shared-db packages/
npm install file:./packages/shared-db
```

### LMS側のコード例

```typescript
// LMSリポジトリでの使い方
import { createSharedSupabaseClient } from "@strategy-school/shared-db/client";
import type {
  Customer,
  Course,
  Lesson,
  LessonProgress,
  CoachingSession,
  Assignment,
} from "@strategy-school/shared-db";

const supabase = createSharedSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 受講生の学習進捗を取得（RLSで自分のデータのみ返る）
const { data: progress } = await supabase
  .from("lesson_progress")
  .select("*, lessons(*)")
  .order("updated_at", { ascending: false });

// セッション一覧を取得（mentor_notesは見えない）
const { data: sessions } = await supabase
  .from("student_coaching_sessions")  // ビュー経由
  .select("*")
  .order("scheduled_at", { ascending: false });
```

## RLS (Row Level Security) 設計

| ロール | customers | sales_pipeline | contracts | learning | courses | lessons | progress | sessions | assignments |
|--------|-----------|---------------|-----------|----------|---------|---------|----------|----------|-------------|
| admin  | 全件RW    | 全件RW        | 全件RW    | 全件RW   | 全件RW  | 全件RW  | 全件RW   | 全件RW   | 全件RW      |
| mentor | 全件RW    | 全件RW        | 全件RW    | 全件RW   | 全件R   | 全件R   | 全件RW   | 全件RW   | 全件RW      |
| student| 自分のみR | ×             | 自分のみR | 自分のみR| 全件R   | 全件R   | 自分のみRW| 自分のみR| 自分のみRW  |

- `student`がcoaching_sessionsを見る場合は`student_coaching_sessions`ビュー経由（`mentor_notes`が除外される）

## セットアップ手順

1. Supabaseプロジェクトを1つ作成
2. マイグレーションを順番に実行:
   ```sql
   -- 001: CRM基本テーブル
   -- 002: LMS用テーブル
   -- 003: RLSポリシー
   ```
3. 両リポジトリの `.env.local` に同じSupabase URL/キーを設定
4. `shared-db` パッケージを両方から参照
