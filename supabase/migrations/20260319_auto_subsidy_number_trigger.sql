-- 補助金対象者に自動でsubsidy_numberを付番するトリガー
-- contracts.subsidy_eligible = true にセットされた時点で自動付番

CREATE OR REPLACE FUNCTION auto_assign_subsidy_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subsidy_eligible = true AND NEW.subsidy_number IS NULL THEN
    SELECT COALESCE(MAX(subsidy_number), 100000) + 1
    INTO NEW.subsidy_number
    FROM contracts
    WHERE subsidy_number IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_subsidy_number ON contracts;
CREATE TRIGGER trg_auto_subsidy_number
  BEFORE INSERT OR UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_subsidy_number();
