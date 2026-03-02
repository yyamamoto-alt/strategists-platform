-- ============================================================
-- 006: Marketing Channel Attribution System
-- マーケティングチャネル帰属テーブル (3テーブル)
-- ============================================================

-- 1. marketing_channels (チャネルマスタ)
CREATE TABLE IF NOT EXISTS marketing_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'その他',
  is_paid BOOLEAN NOT NULL DEFAULT false,
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. channel_mapping_rules (正規化マッピングルール)
CREATE TABLE IF NOT EXISTS channel_mapping_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_field TEXT NOT NULL,
  source_value TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'exact',
  channel_name TEXT NOT NULL,
  notes TEXT,
  priority INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_field, source_value, match_type)
);

-- 3. customer_channel_attribution (帰属結果キャッシュ)
CREATE TABLE IF NOT EXISTS customer_channel_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  marketing_channel TEXT NOT NULL DEFAULT '不明',
  attribution_source TEXT NOT NULL DEFAULT 'fallback',
  confidence TEXT NOT NULL DEFAULT 'low',
  touch_first TEXT,
  touch_decision TEXT,
  touch_last TEXT,
  is_multi_touch BOOLEAN NOT NULL DEFAULT false,
  raw_data JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_channel_attribution_customer ON customer_channel_attribution(customer_id);
CREATE INDEX IF NOT EXISTS idx_channel_attribution_channel ON customer_channel_attribution(marketing_channel);
CREATE INDEX IF NOT EXISTS idx_mapping_rules_source ON channel_mapping_rules(source_field, priority);

-- updated_at トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_marketing_channels_updated') THEN
    CREATE TRIGGER trg_marketing_channels_updated
      BEFORE UPDATE ON marketing_channels
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_channel_mapping_rules_updated') THEN
    CREATE TRIGGER trg_channel_mapping_rules_updated
      BEFORE UPDATE ON channel_mapping_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

-- ============================================================
-- 初期データ: marketing_channels
-- ============================================================
INSERT INTO marketing_channels (name, category, is_paid, priority) VALUES
  ('FB広告', '広告', true, 1),
  ('Google広告', '広告', true, 2),
  ('YouTube広告', '広告', true, 3),
  ('Google検索(自然)', '自然流入', false, 10),
  ('SEO(ブログ)', '自然流入', false, 11),
  ('SEO(直LP)', '自然流入', false, 12),
  ('X(SNS)', 'SNS', false, 20),
  ('YouTube(自然)', 'SNS', false, 21),
  ('Instagram', 'SNS', false, 22),
  ('note', 'コンテンツ', false, 30),
  ('Udemy', 'コンテンツ', false, 31),
  ('ココナラ', 'コンテンツ', false, 32),
  ('Lステップ', 'コンテンツ', false, 33),
  ('口コミ・紹介', '紹介', false, 40),
  ('アフィリエイト', '紹介', false, 41),
  ('不明', 'その他', false, 99)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 初期データ: channel_mapping_rules
-- ============================================================
INSERT INTO channel_mapping_rules (source_field, source_value, match_type, channel_name, notes, priority) VALUES
  -- utm_source ルール
  ('utm_source', 'fbad', 'exact', 'FB広告', 'Facebook広告のUTMソース', 1),
  ('utm_source', 'fb', 'exact', 'FB広告', 'Facebook広告(短縮)', 2),
  ('utm_source', 'facebook', 'exact', 'FB広告', 'Facebook広告(フル)', 3),
  ('utm_source', 'google', 'exact', 'Google広告', 'Google広告のUTMソース', 4),
  ('utm_source', 'google_ads', 'exact', 'Google広告', 'Google Ads', 5),
  ('utm_source', 'youtube', 'exact', 'YouTube広告', 'YouTube広告のUTMソース', 6),
  ('utm_source', 'yt', 'exact', 'YouTube広告', 'YouTube広告(短縮)', 7),
  ('utm_source', 'instagram', 'exact', 'Instagram', 'Instagram広告', 8),
  ('utm_source', 'note', 'exact', 'note', 'noteからの流入', 9),
  ('utm_source', 'twitter', 'exact', 'X(SNS)', 'X(旧Twitter)からの流入', 10),
  ('utm_source', 'x', 'exact', 'X(SNS)', 'X(SNS)からの流入', 11),
  -- initial_channel ルール
  ('initial_channel', 'Google検索', 'exact', 'Google検索(自然)', 'Google自然検索', 20),
  ('initial_channel', 'SEO(直LP)', 'exact', 'SEO(直LP)', 'SEO直LPからの流入', 21),
  ('initial_channel', 'SEO(Blog)', 'exact', 'SEO(ブログ)', 'SEOブログからの流入', 22),
  ('initial_channel', 'YouTube', 'exact', 'YouTube(自然)', 'YouTube自然流入', 23),
  ('initial_channel', 'X', 'exact', 'X(SNS)', 'X(SNS)からの流入', 24),
  ('initial_channel', 'note', 'exact', 'note', 'noteからの流入', 25),
  ('initial_channel', 'Udemy', 'exact', 'Udemy', 'Udemyからの流入', 26),
  ('initial_channel', 'ココナラ', 'exact', 'ココナラ', 'ココナラからの流入', 27),
  ('initial_channel', '口コミ・紹介', 'exact', '口コミ・紹介', '口コミ・紹介からの流入', 28),
  -- application_reason ルール (contains マッチ)
  ('application_reason', 'YouTube', 'contains', 'YouTube(自然)', 'YouTube言及の申込理由', 40),
  ('application_reason', 'Google', 'contains', 'Google検索(自然)', 'Google検索言及の申込理由', 41),
  ('application_reason', 'note', 'contains', 'note', 'note言及の申込理由', 42),
  ('application_reason', '紹介', 'contains', '口コミ・紹介', '紹介言及の申込理由', 43),
  ('application_reason', 'Instagram', 'contains', 'Instagram', 'Instagram言及の申込理由', 44)
ON CONFLICT (source_field, source_value, match_type) DO NOTHING;

-- RLS ポリシー (service_role は常にバイパス)
ALTER TABLE marketing_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_mapping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_channel_attribution ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは読み取り可
CREATE POLICY "authenticated_read_channels" ON marketing_channels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_rules" ON channel_mapping_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_attribution" ON customer_channel_attribution
  FOR SELECT TO authenticated USING (true);
