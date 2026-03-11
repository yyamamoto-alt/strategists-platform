-- user_roles に権限カラムを追加
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS allowed_pages TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS data_months_limit INT;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS mask_pii BOOLEAN DEFAULT FALSE;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS can_edit_customers BOOLEAN DEFAULT TRUE;

-- role の check constraint を更新（mentor → member を許容）
-- 既存の制約があれば削除
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'member', 'mentor', 'student'));

-- 既存の mentor を member に更新
UPDATE user_roles SET role = 'member' WHERE role = 'mentor';

-- invitations テーブルの email を nullable に変更
ALTER TABLE invitations ALTER COLUMN email DROP NOT NULL;

-- invitations に権限設定カラムを追加（招待時に設定する）
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS allowed_pages TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS data_months_limit INT;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS mask_pii BOOLEAN DEFAULT FALSE;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS can_edit_customers BOOLEAN DEFAULT TRUE;

-- 既存の招待の mentor → member に更新
UPDATE invitations SET role = 'member' WHERE role = 'mentor';
