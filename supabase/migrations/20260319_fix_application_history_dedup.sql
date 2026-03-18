-- ============================================================
-- application_history 重複問題の根本修正
-- ============================================================
--
-- 根本原因（繰り返し発生）:
--   同じフォームデータが複数経路（webhook/cron/Pythonスクリプト）で挿入される際、
--   各経路でJSON文字列化・ハッシュ計算方法が異なるため、
--   ユニーク制約をすり抜けて重複が発生。
--
-- 解決策:
--   アプリ側のハッシュ計算に依存せず、DBトリガーでraw_dataから
--   タイムスタンプを除外した上でMD5を自動計算する。
--   どの経路から入っても同一のハッシュが保証される。
-- ============================================================

-- 1. ハッシュ自動計算関数
CREATE OR REPLACE FUNCTION compute_app_history_hash()
RETURNS trigger AS $$
BEGIN
  -- タイムスタンプキーを除外してMD5計算（GAS側でタイムスタンプ形式が不統一のため）
  NEW.raw_data_hash := md5((NEW.raw_data - 'タイムスタンプ')::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. INSERT/UPDATE時にトリガー発火
DROP TRIGGER IF EXISTS trg_compute_app_history_hash ON application_history;
CREATE TRIGGER trg_compute_app_history_hash
  BEFORE INSERT OR UPDATE ON application_history
  FOR EACH ROW
  EXECUTE FUNCTION compute_app_history_hash();

-- 3. raw_data_hash カラム追加（なければ）
ALTER TABLE application_history ADD COLUMN IF NOT EXISTS raw_data_hash TEXT;

-- 4. 全レコードのハッシュをトリガー経由で再計算
UPDATE application_history SET raw_data_hash = md5((raw_data - 'タイムスタンプ')::text)
WHERE raw_data IS NOT NULL;

-- 5. 重複削除（同一 customer_id + source + hash の最新1件のみ保持）
DELETE FROM application_history
WHERE id NOT IN (
  SELECT DISTINCT ON (customer_id, source, raw_data_hash) id
  FROM application_history
  ORDER BY customer_id, source, raw_data_hash, applied_at DESC
);

-- 6. ユニーク制約（既存を削除して再作成）
DROP INDEX IF EXISTS idx_app_history_dedup;
DROP INDEX IF EXISTS idx_application_history_dedup;
CREATE UNIQUE INDEX idx_app_history_dedup ON application_history(customer_id, source, raw_data_hash);
CREATE INDEX IF NOT EXISTS idx_app_history_hash ON application_history(raw_data_hash);
