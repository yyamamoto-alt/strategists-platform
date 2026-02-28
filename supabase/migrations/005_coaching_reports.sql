-- =====================================================
-- 指導報告テーブル: coaching_reports
-- Excel「指導報告DATABASE.xlsx」のデータ格納用
-- =====================================================

CREATE TABLE IF NOT EXISTS coaching_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 指導日
  coaching_date DATE,

  -- 顧客メールアドレス（customers.email とJOIN可能）
  email TEXT,

  -- 回次（合計指導回数）
  session_number INT,

  -- メンター名
  mentor_name TEXT,

  -- 直前キャンセルフラグ
  cancellation TEXT,

  -- 現状の立ち位置（フェルミ推定）
  level_fermi TEXT,

  -- 現状の立ち位置（ケース面接）
  level_case TEXT,

  -- 現状の立ち位置（マッキンゼー対策）
  level_mck TEXT,

  -- 顧客との紐付け（メールアドレスで後からJOIN可能）
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_coaching_reports_email ON coaching_reports(email);
CREATE INDEX IF NOT EXISTS idx_coaching_reports_date ON coaching_reports(coaching_date DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_reports_customer ON coaching_reports(customer_id);
CREATE INDEX IF NOT EXISTS idx_coaching_reports_mentor ON coaching_reports(mentor_name);

-- updated_at トリガー
CREATE TRIGGER coaching_reports_updated_at
  BEFORE UPDATE ON coaching_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
