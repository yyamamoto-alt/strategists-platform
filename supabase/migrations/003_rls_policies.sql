-- =====================================================
-- Row Level Security (RLS)
-- 管理者（CRM側）と受講生（LMS側）のアクセス制御
-- =====================================================

-- ユーザーのロールを管理するテーブル
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,  -- 受講生の場合、紐づくcustomer
  role TEXT NOT NULL CHECK (role IN ('admin', 'mentor', 'student')),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_customer ON user_roles(customer_id);

-- ヘルパー関数
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_customer_id()
RETURNS UUID AS $$
  SELECT customer_id FROM user_roles WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ===== RLS有効化 =====
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- ===== CRM専用テーブル: admin/mentor のみフルアクセス =====

-- customers: admin/mentor は全件、student は自分のみ
CREATE POLICY "admin_mentor_customers" ON customers
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

CREATE POLICY "student_own_customer" ON customers
  FOR SELECT USING (id = get_user_customer_id());

-- sales_pipeline: admin/mentor のみ
CREATE POLICY "admin_mentor_pipeline" ON sales_pipeline
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

-- contracts: admin/mentor フル、student は自分の契約のみ閲覧
CREATE POLICY "admin_mentor_contracts" ON contracts
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

CREATE POLICY "student_own_contract" ON contracts
  FOR SELECT USING (customer_id = get_user_customer_id());

-- agent_records: admin/mentor のみ
CREATE POLICY "admin_mentor_agents" ON agent_records
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

-- activities: admin/mentor のみ
CREATE POLICY "admin_mentor_activities" ON activities
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

-- ===== LMS共用テーブル =====

-- learning_records: admin/mentor フル、student は自分のみ
CREATE POLICY "admin_mentor_learning" ON learning_records
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

CREATE POLICY "student_own_learning" ON learning_records
  FOR SELECT USING (customer_id = get_user_customer_id());

-- courses: 全員閲覧可、admin のみ編集
CREATE POLICY "anyone_view_courses" ON courses
  FOR SELECT USING (TRUE);

CREATE POLICY "admin_manage_courses" ON courses
  FOR ALL USING (get_user_role() = 'admin');

-- lessons: 全員閲覧可、admin のみ編集
CREATE POLICY "anyone_view_lessons" ON lessons
  FOR SELECT USING (TRUE);

CREATE POLICY "admin_manage_lessons" ON lessons
  FOR ALL USING (get_user_role() = 'admin');

-- lesson_progress: admin/mentor フル、student は自分のみ
CREATE POLICY "admin_mentor_progress" ON lesson_progress
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

CREATE POLICY "student_own_progress" ON lesson_progress
  FOR ALL USING (customer_id = get_user_customer_id());

-- coaching_sessions: admin/mentor フル、student は自分のみ（mentor_notesは別途ビューで制御）
CREATE POLICY "admin_mentor_sessions" ON coaching_sessions
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

CREATE POLICY "student_own_sessions" ON coaching_sessions
  FOR SELECT USING (customer_id = get_user_customer_id());

-- assignments: admin/mentor フル、student は自分のみ
CREATE POLICY "admin_mentor_assignments" ON assignments
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

CREATE POLICY "student_own_assignments" ON assignments
  FOR ALL USING (customer_id = get_user_customer_id());

-- ===== 受講生向けビュー（mentor_notesを隠す） =====
CREATE OR REPLACE VIEW student_coaching_sessions AS
SELECT
  id, customer_id, created_at, updated_at,
  scheduled_at, conducted_at, duration_minutes,
  mentor_name, session_type, status,
  student_notes, recording_url
  -- mentor_notes は意図的に除外
FROM coaching_sessions
WHERE customer_id = get_user_customer_id();
