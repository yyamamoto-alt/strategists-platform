-- 1. unmatched_records.connection_id を NULLable に変更
-- Webhook/Jicoo経由の未マッチレコードはspreadsheet_connectionと無関係なのでNULL許可が必要
ALTER TABLE unmatched_records ALTER COLUMN connection_id DROP NOT NULL;

-- 2. unmatched_records に source カラム追加（Webhook経由でformNameを保存するため）
-- 既にコード上で使用されているが、マイグレーションに定義がなかった
DO $$ BEGIN
  ALTER TABLE unmatched_records ADD COLUMN source TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. unmatched_records に notes カラム追加
DO $$ BEGIN
  ALTER TABLE unmatched_records ADD COLUMN notes TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. unmatched_records に raw_data_hash カラム追加 + ユニーク制約
DO $$ BEGIN
  ALTER TABLE unmatched_records ADD COLUMN raw_data_hash TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- raw_data_hash のユニーク制約（重複防止）
CREATE UNIQUE INDEX IF NOT EXISTS idx_unmatched_raw_data_hash
  ON unmatched_records(raw_data_hash) WHERE raw_data_hash IS NOT NULL;

-- 5. 既存の電話番号を正規化（ハイフン・スペース・括弧を除去）
UPDATE customers
SET phone = regexp_replace(phone, '[-\s()（）+\u3000]', '', 'g')
WHERE phone IS NOT NULL
  AND phone ~ '[-\s()（）+]';
