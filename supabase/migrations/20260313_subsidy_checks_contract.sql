-- subsidy_checks テーブルに contract_verified カラムを追加
-- （テーブルが存在しない場合は作成）
CREATE TABLE IF NOT EXISTS subsidy_checks (
  customer_id UUID PRIMARY KEY REFERENCES customers(id),
  identity_doc_verified BOOLEAN NOT NULL DEFAULT false,
  bank_doc_verified BOOLEAN NOT NULL DEFAULT false,
  contract_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 既存テーブルにカラムがない場合のみ追加
ALTER TABLE subsidy_checks ADD COLUMN IF NOT EXISTS contract_verified BOOLEAN NOT NULL DEFAULT false;
