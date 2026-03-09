-- 受講生×メンター多対多中間テーブル
CREATE TABLE IF NOT EXISTS student_mentors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  mentor_id UUID NOT NULL REFERENCES mentors(id),
  role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'sub')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_mentors_user ON student_mentors(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_student_mentors_mentor ON student_mentors(mentor_id, is_active);
