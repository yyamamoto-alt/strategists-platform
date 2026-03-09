-- ============================================================
-- 自動招待機能: テーブル拡張 & 新テーブル作成
-- ============================================================

-- 1a. invitations テーブルにカラム追加
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'lms';
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS course_ids TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 1b. enrollment_applications テーブル作成
CREATE TABLE IF NOT EXISTS enrollment_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  motivation TEXT,
  experience TEXT,
  plan_name TEXT,
  status TEXT DEFAULT 'pending',
  invite_status TEXT DEFAULT 'none',
  invite_sent_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1c. user_course_access テーブル作成
CREATE TABLE IF NOT EXISTS user_course_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

-- 1d. app_settings 初期データ（auto_invite設定）
INSERT INTO app_settings (key, value, description)
VALUES
  ('auto_invite_enabled', '"false"', '自動招待ON/OFF'),
  ('auto_invite_slack_channel', '""', 'Slack承認リクエスト送信先チャンネルID')
ON CONFLICT (key) DO NOTHING;
