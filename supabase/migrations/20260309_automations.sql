-- 自動連携（Automations）テーブル
-- Zapier代替: Google Forms/Sheets → Slack通知の自動連携を管理

CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT DEFAULT 'Sheet1',
  slack_channel_id TEXT NOT NULL,
  slack_channel_name TEXT,
  message_template TEXT,
  link_to_customer BOOLEAN DEFAULT false,
  column_mapping JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_synced_row INT DEFAULT 0,
  known_headers TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 実行ログ
CREATE TABLE automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'success',
  new_rows_count INT DEFAULT 0,
  notifications_sent INT DEFAULT 0,
  error_message TEXT,
  details JSONB
);

CREATE INDEX idx_automation_logs_automation ON automation_logs(automation_id);
CREATE INDEX idx_automation_logs_triggered ON automation_logs(triggered_at DESC);
