-- =====================================================
-- LMS用テーブル追加（CRM/LMS共通DB）
-- LMSリポジトリからも同じDBに接続して使う
-- =====================================================

-- ===== コース・カリキュラム =====
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,                            -- 例: 'ケース面接', 'ビヘイビア面接', '書類対策'
  target_attribute customer_attribute,      -- 既卒/新卒向け（NULLなら共通）
  total_lessons INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0
);

-- ===== レッスン =====
CREATE TYPE lesson_type AS ENUM ('動画', 'テキスト', 'ケース演習', '模擬面接', '課題');

CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT NOT NULL,
  description TEXT,
  lesson_type lesson_type NOT NULL DEFAULT 'テキスト',
  content_url TEXT,                         -- 動画URL / 教材URL
  duration_minutes INT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

-- ===== 受講生のレッスン進捗 =====
CREATE TYPE progress_status AS ENUM ('未着手', '進行中', '完了');

CREATE TABLE lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  status progress_status NOT NULL DEFAULT '未着手',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  score INT,                                -- 100点満点
  feedback TEXT,

  UNIQUE(customer_id, lesson_id)
);

-- ===== 指導セッション（1回の面談/指導記録） =====
CREATE TYPE session_type AS ENUM ('ケース面接', 'ビヘイビア面接', '書類添削', 'キャリア相談', 'その他');
CREATE TYPE session_status AS ENUM ('予定', '完了', 'キャンセル', '欠席');

CREATE TABLE coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ NOT NULL,
  conducted_at TIMESTAMPTZ,
  duration_minutes INT,
  mentor_name TEXT,
  session_type session_type NOT NULL DEFAULT 'その他',
  status session_status NOT NULL DEFAULT '予定',
  mentor_notes TEXT,                        -- メンター用メモ（受講生からは見えない）
  student_notes TEXT,                       -- 受講生用メモ
  recording_url TEXT
);

-- ===== 課題提出 =====
CREATE TYPE assignment_status AS ENUM ('未提出', '提出済', 'レビュー中', 'フィードバック済');

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  submission_url TEXT,
  status assignment_status NOT NULL DEFAULT '未提出',
  score INT,
  reviewer_name TEXT,
  feedback TEXT
);

-- ===== インデックス =====
CREATE INDEX idx_courses_active ON courses(is_active, sort_order);
CREATE INDEX idx_lessons_course ON lessons(course_id, sort_order);
CREATE INDEX idx_progress_customer ON lesson_progress(customer_id);
CREATE INDEX idx_progress_lesson ON lesson_progress(lesson_id);
CREATE INDEX idx_sessions_customer ON coaching_sessions(customer_id);
CREATE INDEX idx_sessions_scheduled ON coaching_sessions(scheduled_at DESC);
CREATE INDEX idx_sessions_mentor ON coaching_sessions(mentor_name);
CREATE INDEX idx_assignments_customer ON assignments(customer_id);
CREATE INDEX idx_assignments_status ON assignments(status);

-- ===== updated_at トリガー =====
CREATE TRIGGER courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER lessons_updated_at BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER progress_updated_at BEFORE UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON coaching_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
