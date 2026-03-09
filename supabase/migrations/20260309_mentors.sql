-- メンター管理テーブル
CREATE TABLE IF NOT EXISTS mentors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  slack_user_id TEXT,
  booking_url TEXT,
  profile_text TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 既存のlearning_recordsからメンター名を自動挿入
INSERT INTO mentors (name)
SELECT DISTINCT mentor_name FROM learning_records
WHERE mentor_name IS NOT NULL AND mentor_name <> ''
ON CONFLICT (name) DO NOTHING;
