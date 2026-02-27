-- ===== 顧客データベースシステム: 初期スキーマ =====

-- ENUM型
CREATE TYPE customer_attribute AS ENUM ('既卒', '新卒');
CREATE TYPE pipeline_stage AS ENUM ('問い合わせ', '日程確定', '面談実施', '提案中', '成約', '入金済', '失注', '保留');
CREATE TYPE deal_status AS ENUM ('未対応', '対応中', '面談済', '成約', '失注', '保留');
CREATE TYPE learning_level AS ENUM ('初級者', '中級者', '上級者');
CREATE TYPE billing_status AS ENUM ('未請求', '請求済', '入金済', '分割中', '滞納');
CREATE TYPE activity_type AS ENUM ('面談', '電話', 'メール', 'メモ', 'ステータス変更', 'その他');
CREATE TYPE placement_result AS ENUM ('内定', '入社済', '活動中', '休止', '未開始');

-- ===== 顧客マスタ =====
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 基本情報
  application_date DATE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  attribute customer_attribute NOT NULL DEFAULT '既卒',

  -- 経歴・プロフィール
  career_history TEXT,
  university TEXT,
  faculty TEXT,
  graduation_year INT,
  sns_accounts TEXT,
  reference_media TEXT,
  hobbies TEXT,
  behavioral_traits TEXT,
  other_background TEXT,
  notes TEXT,
  caution_notes TEXT,
  priority TEXT,
  target_companies TEXT,
  initial_level TEXT
);

-- ===== 営業パイプライン =====
CREATE TABLE sales_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- ステージ
  stage pipeline_stage NOT NULL DEFAULT '問い合わせ',
  deal_status deal_status NOT NULL DEFAULT '未対応',

  -- 面談情報
  meeting_scheduled_date DATE,
  meeting_conducted_date DATE,
  meeting_result TEXT,
  agent_interest_at_application BOOLEAN DEFAULT FALSE,

  -- 営業活動
  sales_date DATE,
  closing_date DATE,
  payment_date DATE,
  sales_content TEXT,
  sales_strategy TEXT,
  decision_factor TEXT,
  comparison_services TEXT,
  second_meeting_category TEXT,
  postponement_date DATE,
  lead_time TEXT,

  -- その他
  ninety_day_message TEXT,
  agent_confirmation TEXT,
  route_by_sales TEXT,

  UNIQUE(customer_id)
);

-- ===== 契約 =====
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 契約情報
  plan_name TEXT,
  changed_plan TEXT,
  first_amount INT,
  second_amount INT,
  confirmed_amount INT,
  discount INT DEFAULT 0,
  contract_amount INT,
  sales_amount INT,

  -- 入金・請求
  billing_status billing_status NOT NULL DEFAULT '未請求',
  payment_date DATE,
  payment_form_url TEXT,

  -- 補助金
  subsidy_eligible BOOLEAN DEFAULT FALSE,
  subsidy_amount INT,

  -- Progress Sheet
  progress_sheet_url TEXT
);

-- ===== 学習記録 =====
CREATE TABLE learning_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 指導期間
  coaching_start_date DATE,
  coaching_end_date DATE,
  last_coaching_date DATE,

  -- 指導実績
  total_sessions INT DEFAULT 0,
  assessment_count INT DEFAULT 0,
  attendance_rate DECIMAL(5,4),

  -- レベル・進捗
  current_level learning_level,
  latest_evaluation TEXT,
  curriculum_progress DECIMAL(5,4),

  -- ケース面接
  case_interview_progress TEXT,
  case_interview_weaknesses TEXT
);

-- ===== エージェント・転職支援 =====
CREATE TABLE agent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- エージェント利用
  agent_service_enrolled BOOLEAN DEFAULT FALSE,
  agent_plan TEXT,
  agent_memo TEXT,

  -- 転職活動
  job_search_status placement_result DEFAULT '未開始',
  selection_status TEXT,
  level_up_confirmed TEXT,
  document_pass_rate DECIMAL(5,4),
  exam_count INT DEFAULT 0,

  -- 内定・入社
  offer_company TEXT,
  placement_company TEXT,
  placement_date DATE,
  offer_salary INT,
  expected_salary_rate DECIMAL(5,4),
  referral_fee_rate DECIMAL(5,4),
  margin INT,

  -- 利用エージェント
  external_agents TEXT,

  -- 失注
  loss_reason TEXT,
  loss_detail TEXT
);

-- ===== 活動履歴 =====
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activity_type activity_type NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT
);

-- ===== インデックス =====
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_attribute ON customers(attribute);
CREATE INDEX idx_customers_application_date ON customers(application_date DESC);
CREATE INDEX idx_pipeline_stage ON sales_pipeline(stage);
CREATE INDEX idx_pipeline_customer ON sales_pipeline(customer_id);
CREATE INDEX idx_contracts_customer ON contracts(customer_id);
CREATE INDEX idx_contracts_billing ON contracts(billing_status);
CREATE INDEX idx_learning_customer ON learning_records(customer_id);
CREATE INDEX idx_agent_customer ON agent_records(customer_id);
CREATE INDEX idx_activities_customer ON activities(customer_id);
CREATE INDEX idx_activities_created ON activities(created_at DESC);

-- ===== updated_at 自動更新トリガー =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER pipeline_updated_at BEFORE UPDATE ON sales_pipeline FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER learning_updated_at BEFORE UPDATE ON learning_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER agent_updated_at BEFORE UPDATE ON agent_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
