-- Meta Ads: Ad Set (広告セット) level daily data
CREATE TABLE IF NOT EXISTS analytics_meta_adset_daily (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  campaign_name TEXT NOT NULL,
  adset_name TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  cpc REAL DEFAULT 0,
  spend REAL DEFAULT 0,
  link_clicks INTEGER DEFAULT 0,
  landing_page_views INTEGER DEFAULT 0,
  cv_custom REAL DEFAULT 0,
  reach INTEGER DEFAULT 0,
  frequency REAL DEFAULT 0,
  cpm REAL DEFAULT 0,
  UNIQUE(date, campaign_name, adset_name)
);
CREATE INDEX IF NOT EXISTS idx_meta_adset_daily_date ON analytics_meta_adset_daily(date);

-- Meta Ads: Ad (クリエイティブ) level daily data
CREATE TABLE IF NOT EXISTS analytics_meta_ad_daily (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  campaign_name TEXT NOT NULL,
  adset_name TEXT NOT NULL,
  ad_name TEXT NOT NULL,
  ad_id TEXT,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  cpc REAL DEFAULT 0,
  spend REAL DEFAULT 0,
  link_clicks INTEGER DEFAULT 0,
  landing_page_views INTEGER DEFAULT 0,
  cv_custom REAL DEFAULT 0,
  reach INTEGER DEFAULT 0,
  frequency REAL DEFAULT 0,
  cpm REAL DEFAULT 0,
  UNIQUE(date, campaign_name, adset_name, ad_name)
);
CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_date ON analytics_meta_ad_daily(date);

-- Add reach, frequency, cpm to existing campaign table
ALTER TABLE analytics_meta_campaign_daily ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0;
ALTER TABLE analytics_meta_campaign_daily ADD COLUMN IF NOT EXISTS frequency REAL DEFAULT 0;
ALTER TABLE analytics_meta_campaign_daily ADD COLUMN IF NOT EXISTS cpm REAL DEFAULT 0;
