-- 010: LMS コース・教材管理機能のスキーマ拡張
-- courses テーブル拡張 + modules テーブル新設 + lessons テーブル拡張

-- ============================================
-- courses テーブルに不足カラム追加
-- ============================================
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS duration_weeks INT DEFAULT 12,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS instructor_id UUID,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug) WHERE slug IS NOT NULL;

-- ============================================
-- lessons テーブルに不足カラム追加
-- ============================================
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS markdown_content TEXT,
  ADD COLUMN IF NOT EXISTS copy_protected BOOLEAN DEFAULT TRUE;

-- ============================================
-- modules テーブル新設（コース内の章構成）
-- ============================================
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id, sort_order);

-- lessons に module_id 追加（modules への紐付け）
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS module_id UUID REFERENCES modules(id) ON DELETE SET NULL;

-- ============================================
-- RLS for modules
-- ============================================
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anyone_view_modules' AND tablename = 'modules') THEN
    CREATE POLICY "anyone_view_modules" ON modules FOR SELECT USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_modules' AND tablename = 'modules') THEN
    CREATE POLICY "admin_manage_modules" ON modules FOR ALL USING (
      EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
      )
    );
  END IF;
END
$$;

-- ============================================
-- updated_at トリガー（まだなければ追加）
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'courses_updated_at') THEN
    CREATE TRIGGER courses_updated_at BEFORE UPDATE ON courses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lessons_updated_at') THEN
    CREATE TRIGGER lessons_updated_at BEFORE UPDATE ON lessons
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END
$$;
