-- メンターテーブル: email/phone削除、line_url追加
ALTER TABLE mentors DROP COLUMN IF EXISTS email;
ALTER TABLE mentors DROP COLUMN IF EXISTS phone;
ALTER TABLE mentors ADD COLUMN IF NOT EXISTS line_url TEXT;
