-- ============================================================
-- 008: Google Sheets連携 + 顧客マッチングシステム
-- ============================================================

-- 顧客メールアドレス（複数対応）
CREATE TABLE customer_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);

-- 既存customers.emailからの初期データ投入
INSERT INTO customer_emails (customer_id, email, is_primary)
SELECT id, email, true FROM customers WHERE email IS NOT NULL AND email != '';

CREATE INDEX idx_customer_emails_email ON customer_emails(email);
CREATE INDEX idx_customer_emails_customer ON customer_emails(customer_id);

-- 申込履歴（再申込トラッキング）
CREATE TABLE application_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT,
  raw_data JSONB,
  notes TEXT
);

CREATE INDEX idx_app_history_customer ON application_history(customer_id);

-- スプレッドシート接続設定
CREATE TABLE spreadsheet_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'google_sheets',
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT DEFAULT 'Sheet1',
  column_mapping JSONB NOT NULL DEFAULT '{}',
  sync_mode TEXT DEFAULT 'append',
  last_synced_at TIMESTAMPTZ,
  last_synced_row INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 同期ログ
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES spreadsheet_connections(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  rows_processed INT DEFAULT 0,
  rows_created INT DEFAULT 0,
  rows_updated INT DEFAULT 0,
  rows_unmatched INT DEFAULT 0,
  error_message TEXT,
  details JSONB
);

CREATE INDEX idx_sync_logs_connection ON sync_logs(connection_id);

-- 未マッチレコードキュー
CREATE TABLE unmatched_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id UUID REFERENCES sync_logs(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES spreadsheet_connections(id) ON DELETE CASCADE,
  raw_data JSONB NOT NULL,
  email TEXT,
  phone TEXT,
  name TEXT,
  status TEXT DEFAULT 'pending',
  resolved_customer_id UUID REFERENCES customers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_unmatched_status ON unmatched_records(status);
