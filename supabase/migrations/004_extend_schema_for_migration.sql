-- =====================================================
-- スプレッドシート移行対応: スキーマ拡張
-- 既存テーブルにカラム追加 + 新テーブル作成
-- =====================================================

-- ENUMs を TEXT に変更（スプレッドシートの自由テキストに対応）
-- pipeline_stage, deal_status 等は既存データの値が多様なため TEXT に

ALTER TABLE sales_pipeline
  ALTER COLUMN stage TYPE TEXT USING stage::TEXT,
  ALTER COLUMN deal_status TYPE TEXT USING deal_status::TEXT;

ALTER TABLE contracts
  ALTER COLUMN billing_status TYPE TEXT USING billing_status::TEXT;

ALTER TABLE learning_records
  ALTER COLUMN current_level TYPE TEXT USING current_level::TEXT;

ALTER TABLE agent_records
  ALTER COLUMN job_search_status TYPE TEXT USING job_search_status::TEXT;

-- ===== customers テーブル拡張 =====
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS utm_id TEXT,
  ADD COLUMN IF NOT EXISTS name_kana TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS karte_email TEXT,
  ADD COLUMN IF NOT EXISTS karte_phone TEXT,
  ADD COLUMN IF NOT EXISTS target_firm_type TEXT,
  ADD COLUMN IF NOT EXISTS application_reason TEXT,
  ADD COLUMN IF NOT EXISTS application_reason_karte TEXT,
  ADD COLUMN IF NOT EXISTS program_interest TEXT,
  ADD COLUMN IF NOT EXISTS desired_schedule TEXT,
  ADD COLUMN IF NOT EXISTS purchased_content TEXT,
  ADD COLUMN IF NOT EXISTS parent_support TEXT,
  ADD COLUMN IF NOT EXISTS transfer_intent TEXT;

-- ===== sales_pipeline テーブル拡張 =====
ALTER TABLE sales_pipeline
  ALTER COLUMN stage SET DEFAULT '問い合わせ',
  ALTER COLUMN deal_status SET DEFAULT '未対応';

ALTER TABLE sales_pipeline
  ADD COLUMN IF NOT EXISTS projected_amount INT,
  ADD COLUMN IF NOT EXISTS probability DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS response_date DATE,
  ADD COLUMN IF NOT EXISTS sales_person TEXT,
  ADD COLUMN IF NOT EXISTS jicoo_message TEXT,
  ADD COLUMN IF NOT EXISTS marketing_memo TEXT,
  ADD COLUMN IF NOT EXISTS sales_route TEXT,
  ADD COLUMN IF NOT EXISTS first_reward_category TEXT,
  ADD COLUMN IF NOT EXISTS performance_reward_category TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_target TEXT,
  ADD COLUMN IF NOT EXISTS alternative_application TEXT,
  ADD COLUMN IF NOT EXISTS status_confirmed_date DATE,
  ADD COLUMN IF NOT EXISTS status_final_date DATE,
  ADD COLUMN IF NOT EXISTS sales_form_status TEXT,
  ADD COLUMN IF NOT EXISTS additional_sales_content TEXT,
  ADD COLUMN IF NOT EXISTS additional_plan TEXT,
  ADD COLUMN IF NOT EXISTS additional_discount_info TEXT,
  ADD COLUMN IF NOT EXISTS additional_notes TEXT,
  ADD COLUMN IF NOT EXISTS initial_channel TEXT;

-- ===== contracts テーブル拡張 =====
ALTER TABLE contracts
  ALTER COLUMN billing_status SET DEFAULT '未請求';

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS referral_category TEXT,
  ADD COLUMN IF NOT EXISTS referral_status TEXT,
  ADD COLUMN IF NOT EXISTS enrollment_status TEXT,
  ADD COLUMN IF NOT EXISTS invoice_info TEXT;

-- ===== learning_records テーブル拡張 =====
ALTER TABLE learning_records
  ADD COLUMN IF NOT EXISTS mentor_name TEXT,
  ADD COLUMN IF NOT EXISTS contract_months INT,
  ADD COLUMN IF NOT EXISTS weekly_sessions DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS completed_sessions INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_completion_rate DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS level_fermi TEXT,
  ADD COLUMN IF NOT EXISTS level_case TEXT,
  ADD COLUMN IF NOT EXISTS level_mck TEXT,
  ADD COLUMN IF NOT EXISTS level_up_range TEXT,
  ADD COLUMN IF NOT EXISTS interview_timing_at_end TEXT,
  ADD COLUMN IF NOT EXISTS target_companies_at_end TEXT,
  ADD COLUMN IF NOT EXISTS offer_probability_at_end TEXT,
  ADD COLUMN IF NOT EXISTS additional_coaching_proposal TEXT,
  ADD COLUMN IF NOT EXISTS initial_coaching_level TEXT,
  ADD COLUMN IF NOT EXISTS enrollment_form_date DATE,
  ADD COLUMN IF NOT EXISTS coaching_requests TEXT,
  ADD COLUMN IF NOT EXISTS enrollment_reason TEXT,
  ADD COLUMN IF NOT EXISTS behavior_session1 TEXT,
  ADD COLUMN IF NOT EXISTS behavior_session2 TEXT,
  ADD COLUMN IF NOT EXISTS assessment_session1 TEXT,
  ADD COLUMN IF NOT EXISTS assessment_session2 TEXT,
  ADD COLUMN IF NOT EXISTS extension_days INT,
  ADD COLUMN IF NOT EXISTS mentoring_satisfaction TEXT,
  ADD COLUMN IF NOT EXISTS start_email_sent TEXT,
  ADD COLUMN IF NOT EXISTS progress_text TEXT,
  ADD COLUMN IF NOT EXISTS selection_status TEXT;

-- ===== agent_records テーブル拡張 =====
ALTER TABLE agent_records
  ADD COLUMN IF NOT EXISTS expected_agent_revenue INT,
  ADD COLUMN IF NOT EXISTS hire_rate DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS offer_probability DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS expected_referral_fee INT,
  ADD COLUMN IF NOT EXISTS agent_staff TEXT,
  ADD COLUMN IF NOT EXISTS placement_confirmed TEXT,
  ADD COLUMN IF NOT EXISTS general_memo TEXT;

-- ===== 決済テーブル (Apps相当) =====
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  plan_name TEXT,
  payment_type TEXT,
  email TEXT,
  customer_name TEXT,
  purchase_date DATE,
  status TEXT,
  amount INT,
  next_billing_date TEXT,
  memo TEXT,
  installment_amount INT,
  installment_count INT,
  period TEXT,

  -- 顧客との紐付け（メールアドレスで後からJOIN可能）
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);

-- ===== 銀行振込テーブル (銀行相当) =====
CREATE TABLE IF NOT EXISTS bank_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  transfer_date DATE,
  period DATE,
  buyer_name TEXT,
  product TEXT,
  amount INT,
  list_price INT,
  discounted_price INT,
  genre TEXT,
  email TEXT,
  status TEXT,

  -- 顧客との紐付け
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_email ON bank_transfers(email);
CREATE INDEX IF NOT EXISTS idx_bank_date ON bank_transfers(transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_customer ON bank_transfers(customer_id);

-- ===== updated_at トリガー =====
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER bank_updated_at BEFORE UPDATE ON bank_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
