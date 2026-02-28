-- =====================================================
-- RLS有効化 & ポリシー適用
-- ※ user_roles テーブル・ヘルパー関数は作成済み
-- Supabase SQL Editor でこのファイルを全文実行してください
-- =====================================================

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
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transfers ENABLE ROW LEVEL SECURITY;

-- ===== CRM専用テーブル: admin/mentor のみフルアクセス =====

-- customers
CREATE POLICY "admin_mentor_customers" ON customers
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));
CREATE POLICY "student_own_customer" ON customers
  FOR SELECT USING (id = get_user_customer_id());

-- sales_pipeline
CREATE POLICY "admin_mentor_pipeline" ON sales_pipeline
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

-- contracts
CREATE POLICY "admin_mentor_contracts" ON contracts
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));
CREATE POLICY "student_own_contract" ON contracts
  FOR SELECT USING (customer_id = get_user_customer_id());

-- agent_records
CREATE POLICY "admin_mentor_agents" ON agent_records
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

-- activities
CREATE POLICY "admin_mentor_activities" ON activities
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

-- payments
CREATE POLICY "admin_mentor_payments" ON payments
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

-- bank_transfers
CREATE POLICY "admin_mentor_bank_transfers" ON bank_transfers
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));

-- ===== LMS共用テーブル =====

-- learning_records
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

-- lesson_progress
CREATE POLICY "admin_mentor_progress" ON lesson_progress
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));
CREATE POLICY "student_own_progress" ON lesson_progress
  FOR ALL USING (customer_id = get_user_customer_id());

-- coaching_sessions
CREATE POLICY "admin_mentor_sessions" ON coaching_sessions
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));
CREATE POLICY "student_own_sessions" ON coaching_sessions
  FOR SELECT USING (customer_id = get_user_customer_id());

-- assignments
CREATE POLICY "admin_mentor_assignments" ON assignments
  FOR ALL USING (get_user_role() IN ('admin', 'mentor'));
CREATE POLICY "student_own_assignments" ON assignments
  FOR ALL USING (customer_id = get_user_customer_id());

-- ===== 検証 =====
-- 以下を実行してRLSが有効か確認:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
