-- GA4 + Search Console 日次データ蓄積テーブル

-- ブログ記事別 & ページ別 日次KPI（GA4）
CREATE TABLE IF NOT EXISTS analytics_page_daily (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  page_path TEXT NOT NULL,
  page_title TEXT,
  segment TEXT NOT NULL DEFAULT 'other', -- 'blog', 'lp_main', 'lp3', 'other'
  -- GA4 metrics
  pageviews INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  users INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  avg_session_duration REAL DEFAULT 0,
  bounce_rate REAL DEFAULT 0,
  -- CV = /schedule/ 遷移数
  schedule_visits INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, page_path)
);

-- LP流入経路別 日次KPI（GA4 UTM/チャネル）
CREATE TABLE IF NOT EXISTS analytics_traffic_daily (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  landing_page TEXT NOT NULL, -- '/', '/lp3/' etc
  source TEXT, -- utm_source or session source
  medium TEXT, -- utm_medium or session medium
  campaign TEXT, -- utm_campaign
  channel_group TEXT, -- GA4 default channel group
  -- GA4 metrics
  sessions INTEGER DEFAULT 0,
  users INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  schedule_visits INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, landing_page, source, medium, campaign)
);

-- Search Console 日次データ（ページ × クエリ、クリック1以上のみ）
CREATE TABLE IF NOT EXISTS analytics_search_daily (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  page_path TEXT NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  position REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, page_path, query)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_analytics_page_daily_date ON analytics_page_daily(date);
CREATE INDEX IF NOT EXISTS idx_analytics_page_daily_segment ON analytics_page_daily(segment);
CREATE INDEX IF NOT EXISTS idx_analytics_traffic_daily_date ON analytics_traffic_daily(date);
CREATE INDEX IF NOT EXISTS idx_analytics_traffic_daily_landing ON analytics_traffic_daily(landing_page);
CREATE INDEX IF NOT EXISTS idx_analytics_search_daily_date ON analytics_search_daily(date);
CREATE INDEX IF NOT EXISTS idx_analytics_search_daily_page ON analytics_search_daily(page_path);
