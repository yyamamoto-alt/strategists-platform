CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Insert default settings
INSERT INTO app_settings (key, value, description) VALUES
  ('default_ltv_kisotsu', '427636', 'デフォルトLTV（既卒）'),
  ('default_ltv_shinsotsu', '240000', 'デフォルトLTV（新卒）'),
  ('referral_fee_rate', '0.3', 'デフォルト紹介料率'),
  ('margin_rate', '0.75', 'デフォルトマージン率'),
  ('seiyaku_display_days', '14', '成約ステージ表示日数'),
  ('auto_lost_days', '14', '自動失注見込移行日数'),
  ('currency_locale', '"ja-JP"', '通貨フォーマットロケール'),
  ('date_format', '"yyyy/MM/dd"', '日付フォーマット')
ON CONFLICT (key) DO NOTHING;
