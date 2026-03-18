-- 補助金対象者の識別ID（kintone報告用）
-- 100001から始まる連番。古い入塾者から順に付番
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS subsidy_number INTEGER UNIQUE;

CREATE INDEX IF NOT EXISTS idx_contracts_subsidy_number ON contracts(subsidy_number) WHERE subsidy_number IS NOT NULL;
