-- Meta (Facebook) Ads campaign daily data
CREATE TABLE IF NOT EXISTS analytics_meta_campaign_daily (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  campaign_name TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  cpc REAL DEFAULT 0,
  spend REAL DEFAULT 0,
  link_clicks INTEGER DEFAULT 0,
  landing_page_views INTEGER DEFAULT 0,
  cv_custom REAL DEFAULT 0,
  UNIQUE(date, campaign_name)
);
CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_date ON analytics_meta_campaign_daily(date);
