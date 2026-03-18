-- 既存agent_recordsの紹介料率・マージンを統一
-- 紹介料率: 0.3 (30%), マージン: 0.7 (70%)

UPDATE agent_records SET referral_fee_rate = 0.3 WHERE referral_fee_rate IS NULL OR referral_fee_rate != 0.3;
UPDATE agent_records SET margin = 0.7 WHERE margin IS NULL OR margin != 0.7;

-- 今後のデフォルト値を設定
ALTER TABLE agent_records ALTER COLUMN referral_fee_rate SET DEFAULT 0.3;
ALTER TABLE agent_records ALTER COLUMN margin SET DEFAULT 0.7;

-- app_settings のマージンも70%に修正
UPDATE app_settings SET value = '0.7' WHERE key = 'margin_rate' AND value != '0.7';

-- 想定年収のデフォルトを800万に設定
ALTER TABLE agent_records ALTER COLUMN offer_salary SET DEFAULT 8000000;
