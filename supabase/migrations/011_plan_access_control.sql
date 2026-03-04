-- 011: プラン別アクセス制御
-- plans テーブル, course_plan_access ジョインテーブル, contract_plan_mapping

-- ============================================
-- plans テーブル（受講プランマスタ）
-- ============================================
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  target_attribute TEXT NOT NULL,  -- '既卒' or '新卒'
  tier TEXT NOT NULL,              -- 'premium','standard','light','minimum','senkomu','soukon'
  mentoring_sessions INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plans_active ON plans(is_active, sort_order);
CREATE INDEX idx_plans_target ON plans(target_attribute);

-- 初期データ: 10プラン
INSERT INTO plans (slug, name, target_attribute, tier, mentoring_sessions, sort_order, description) VALUES
  ('kisotsu_long',      '既卒/長期',         '既卒', 'premium',  16, 1,  '長期プラン（16回メンタリング）'),
  ('kisotsu_standard',  '既卒/通常',         '既卒', 'standard', 12, 2,  '通常プラン（12回メンタリング）'),
  ('kisotsu_short',     '既卒/短期',         '既卒', 'light',     8, 3,  '短期プラン（8回メンタリング）'),
  ('kisotsu_express',   '既卒/特急',         '既卒', 'minimum',   4, 4,  '特急プラン（4回メンタリング）'),
  ('kisotsu_soukon',    '既卒/総コン特化',   '既卒', 'soukon',    6, 5,  '総合コンサル特化プラン'),
  ('kisotsu_subsidy',   '既卒/補助金適用',   '既卒', 'standard', 12, 6,  '補助金適用プラン（12回メンタリング）'),
  ('shinsotsu_standard','新卒/スタンダード', '新卒', 'standard',  0, 10, '新卒スタンダード（フルカリキュラム38項目）'),
  ('shinsotsu_light',   '新卒/ライト',       '新卒', 'light',     0, 11, '新卒ライト（フルカリキュラム38項目）'),
  ('shinsotsu_minimum', '新卒/ミニマム',     '新卒', 'minimum',   0, 12, '新卒ミニマム（26項目）'),
  ('shinsotsu_senkomu', '新卒/選コミュ',     '新卒', 'senkomu',   0, 13, '新卒選コミュ（9項目）');

-- ============================================
-- course_plan_access（コース×プラン N:N）
-- エントリなし = 全プラン公開（安全側）
-- ============================================
CREATE TABLE course_plan_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, plan_id)
);

CREATE INDEX idx_cpa_course ON course_plan_access(course_id);
CREATE INDEX idx_cpa_plan ON course_plan_access(plan_id);

-- ============================================
-- contract_plan_mapping（既存contracts.plan_name → plan_id変換）
-- ============================================
CREATE TABLE contract_plan_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_plan_name TEXT NOT NULL UNIQUE,  -- contracts.plan_name の値
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 既存のplan_name値とプランのマッピング
-- ※ 実際のcontractsデータのplan_name値に合わせて追加・調整が必要
INSERT INTO contract_plan_mapping (contract_plan_name, plan_id)
SELECT mapping.contract_plan_name, p.id
FROM (VALUES
  ('既卒/長期',         'kisotsu_long'),
  ('既卒/通常',         'kisotsu_standard'),
  ('既卒/短期',         'kisotsu_short'),
  ('既卒/特急',         'kisotsu_express'),
  ('既卒/総コン特化',   'kisotsu_soukon'),
  ('既卒/補助金適用',   'kisotsu_subsidy'),
  ('新卒/スタンダード', 'shinsotsu_standard'),
  ('新卒/ライト',       'shinsotsu_light'),
  ('新卒/ミニマム',     'shinsotsu_minimum'),
  ('新卒/選コミュ',     'shinsotsu_senkomu')
) AS mapping(contract_plan_name, plan_slug)
JOIN plans p ON p.slug = mapping.plan_slug;

-- ============================================
-- ヘルパー関数: 受講生のプランIDを取得
-- ============================================
CREATE OR REPLACE FUNCTION get_student_plan_id()
RETURNS UUID AS $$
  SELECT cpm.plan_id
  FROM user_roles ur
  JOIN contracts c ON c.customer_id = ur.customer_id
  JOIN contract_plan_mapping cpm ON cpm.contract_plan_name = c.plan_name
  WHERE ur.user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- RLS
-- ============================================
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_plan_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_plan_mapping ENABLE ROW LEVEL SECURITY;

-- plans: 全員閲覧可、admin のみ編集
CREATE POLICY "anyone_view_plans" ON plans
  FOR SELECT USING (TRUE);

CREATE POLICY "admin_manage_plans" ON plans
  FOR ALL USING (get_user_role() = 'admin');

-- course_plan_access: 全員閲覧可、admin のみ編集
CREATE POLICY "anyone_view_cpa" ON course_plan_access
  FOR SELECT USING (TRUE);

CREATE POLICY "admin_manage_cpa" ON course_plan_access
  FOR ALL USING (get_user_role() = 'admin');

-- contract_plan_mapping: 全員閲覧可、admin のみ編集
CREATE POLICY "anyone_view_cpm" ON contract_plan_mapping
  FOR SELECT USING (TRUE);

CREATE POLICY "admin_manage_cpm" ON contract_plan_mapping
  FOR ALL USING (get_user_role() = 'admin');

-- ============================================
-- courses の SELECTポリシーを更新
-- admin/mentorは全件、studentはプラン紐付きのみ
-- ※ course_plan_accessにエントリなし = 全プラン公開
-- ============================================

-- 既存ポリシーを削除して再作成
DROP POLICY IF EXISTS "anyone_view_courses" ON courses;

-- admin/mentor: 全コース閲覧可
CREATE POLICY "admin_mentor_view_courses" ON courses
  FOR SELECT USING (get_user_role() IN ('admin', 'mentor'));

-- student: プラン紐付きコース OR プラン設定なしコース（全公開）
CREATE POLICY "student_view_courses" ON courses
  FOR SELECT USING (
    get_user_role() = 'student'
    AND (
      -- プラン設定なし = 全プラン公開
      NOT EXISTS (
        SELECT 1 FROM course_plan_access WHERE course_id = courses.id
      )
      OR
      -- 自分のプランに紐付いたコース
      EXISTS (
        SELECT 1 FROM course_plan_access cpa
        WHERE cpa.course_id = courses.id
        AND cpa.plan_id = get_student_plan_id()
      )
    )
  );

-- 未認証ユーザー（ログイン前）にもコース一覧を見せたい場合
CREATE POLICY "anon_view_active_courses" ON courses
  FOR SELECT USING (
    get_user_role() IS NULL AND is_active = TRUE
  );

-- ============================================
-- updated_at トリガー
-- ============================================
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
