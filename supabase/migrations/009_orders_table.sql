-- =====================================================
-- Migration 009: 統合取引テーブル (orders)
-- payments + bank_transfers → 一元管理
-- =====================================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_type TEXT NOT NULL DEFAULT 'other',       -- 'main_plan'|'video_course'|'other'|'additional_coaching'
  product_name TEXT,
  amount INT NOT NULL DEFAULT 0,                  -- 税込金額
  status TEXT DEFAULT 'pending',                  -- 'pending'|'paid'|'partial'|'refunded'|'cancelled'
  payment_method TEXT,                            -- 'credit_card'|'bank_transfer'|'apps'
  ordered_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- 税金フィールド（2026-04-01 課税事業者対応）
  amount_excl_tax INT,                            -- 税抜金額（=売上）
  tax_amount INT DEFAULT 0,
  tax_rate DECIMAL DEFAULT 0,                     -- 0=免税期間, 0.10=10%

  -- ソース管理
  source TEXT NOT NULL,                           -- 'stripe'|'apps'|'freee'|'manual'|'excel_migration'
  source_record_id TEXT,                          -- 各ソースの一意ID
  source_contract_id TEXT,                        -- Apps: contract_id

  -- 分割払い
  installment_total INT,
  installment_index INT,
  installment_amount INT,
  total_price INT,

  -- カード情報
  card_brand TEXT,
  card_last4 TEXT,

  -- 連絡先（顧客未マッチ時の参照用）
  contact_email TEXT,
  contact_name TEXT,
  contact_phone TEXT,

  -- その他
  memo TEXT,
  raw_data JSONB,
  match_status TEXT DEFAULT 'unmatched',          -- 'matched'|'unmatched'|'manual'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE UNIQUE INDEX idx_orders_source_dedup ON orders(source, source_record_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_email ON orders(contact_email);
CREATE INDEX idx_orders_paid_at ON orders(paid_at DESC);
CREATE INDEX idx_orders_match_status ON orders(match_status) WHERE match_status = 'unmatched';
CREATE INDEX idx_orders_source_contract ON orders(source_contract_id) WHERE source_contract_id IS NOT NULL;

-- updated_at トリガー（既存 update_updated_at() 関数を再利用）
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 安全な日付キャスト関数（不正な日付は NULL にフォールバック）
-- =====================================================
CREATE OR REPLACE FUNCTION safe_to_timestamptz(val TEXT)
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN val::TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 既存 payments → orders コピー
-- =====================================================
INSERT INTO orders (
  customer_id, order_type, product_name, amount, status, payment_method, paid_at,
  amount_excl_tax, tax_amount, tax_rate, source, source_record_id,
  installment_total, installment_amount, contact_email, contact_name,
  match_status, created_at
)
SELECT
  p.customer_id,
  CASE
    WHEN p.plan_name ILIKE '%ライトプラン%' OR p.plan_name ILIKE '%スタンダード%' OR p.plan_name ILIKE '%プレミアム%'
      THEN 'main_plan'
    WHEN p.plan_name ILIKE '%動画%' OR p.plan_name ILIKE '%講座%'
      THEN 'video_course'
    WHEN p.plan_name ILIKE '%追加指導%' OR p.plan_name ILIKE '%追加コーチング%'
      THEN 'additional_coaching'
    ELSE 'other'
  END,
  p.plan_name,
  COALESCE(p.amount, 0),
  COALESCE(p.status, 'paid'),
  'apps',
  safe_to_timestamptz(p.purchase_date),
  COALESCE(p.amount, 0),  -- 免税期間: amount_excl_tax = amount
  0,                        -- tax_amount = 0
  0,                        -- tax_rate = 0
  'excel_migration',
  p.id::TEXT,
  p.installment_count,
  p.installment_amount,
  LOWER(TRIM(p.email)),
  p.customer_name,
  CASE WHEN p.customer_id IS NOT NULL THEN 'matched' ELSE 'unmatched' END,
  p.created_at
FROM payments p;

-- =====================================================
-- 既存 bank_transfers → orders コピー
-- =====================================================
INSERT INTO orders (
  customer_id, order_type, product_name, amount, status, payment_method, paid_at,
  amount_excl_tax, tax_amount, tax_rate, source, source_record_id,
  contact_email, contact_name, match_status, created_at
)
SELECT
  bt.customer_id,
  CASE
    WHEN bt.product ILIKE '%ライトプラン%' OR bt.product ILIKE '%スタンダード%' OR bt.product ILIKE '%プレミアム%'
      THEN 'main_plan'
    WHEN bt.product ILIKE '%動画%' OR bt.product ILIKE '%講座%'
      THEN 'video_course'
    ELSE 'other'
  END,
  bt.product,
  COALESCE(bt.amount, 0),
  COALESCE(bt.status, 'paid'),
  'bank_transfer',
  safe_to_timestamptz(bt.transfer_date),
  COALESCE(bt.amount, 0),  -- 免税期間: amount_excl_tax = amount
  0,                         -- tax_amount = 0
  0,                         -- tax_rate = 0
  'excel_migration',
  'bt_' || bt.id::TEXT,      -- bt_ prefix で payments と衝突回避
  LOWER(TRIM(bt.email)),
  bt.buyer_name,
  CASE WHEN bt.customer_id IS NOT NULL THEN 'matched' ELSE 'unmatched' END,
  bt.created_at
FROM bank_transfers bt;
