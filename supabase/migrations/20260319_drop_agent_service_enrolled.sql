-- agent_service_enrolled は未使用（全レコード FALSE のまま）。
-- エージェント利用判定は contracts.referral_category で行っている。
ALTER TABLE agent_records DROP COLUMN IF EXISTS agent_service_enrolled;
