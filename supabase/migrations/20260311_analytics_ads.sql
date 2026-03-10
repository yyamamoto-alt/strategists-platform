-- Google Ads データテーブル (2026-03-11)

-- キャンペーン別日次データ
CREATE TABLE IF NOT EXISTS analytics_ads_campaign_daily (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  campaign_name TEXT NOT NULL,
  campaign_status TEXT NOT NULL DEFAULT 'ENABLED',
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  avg_cpc REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0,
  cv_application REAL NOT NULL DEFAULT 0,
  cv_micro REAL NOT NULL DEFAULT 0,
  cost_per_conversion REAL NOT NULL DEFAULT 0,
  UNIQUE(date, campaign_name)
);

CREATE INDEX IF NOT EXISTS idx_ads_campaign_daily_date ON analytics_ads_campaign_daily(date);

-- キーワード別日次データ
CREATE TABLE IF NOT EXISTS analytics_ads_keyword_daily (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  campaign_name TEXT NOT NULL,
  keyword TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'BROAD',
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0,
  cv_application REAL NOT NULL DEFAULT 0,
  cv_micro REAL NOT NULL DEFAULT 0,
  UNIQUE(date, campaign_name, keyword, match_type)
);

CREATE INDEX IF NOT EXISTS idx_ads_keyword_daily_date ON analytics_ads_keyword_daily(date);

-- 広告変更履歴
CREATE TABLE IF NOT EXISTS analytics_ads_changes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  change_date TIMESTAMPTZ NOT NULL,
  resource_type TEXT NOT NULL,
  change_operation TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(change_date, resource_type, change_operation, description)
);

CREATE INDEX IF NOT EXISTS idx_ads_changes_date ON analytics_ads_changes(change_date);
