-- YouTube Analytics テーブル (2026-03-12)

-- 動画マスタ
CREATE TABLE IF NOT EXISTS analytics_youtube_videos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER DEFAULT 0,
  tags TEXT[],
  total_views BIGINT DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yt_videos_published ON analytics_youtube_videos(published_at);

-- 動画別日次KPI
CREATE TABLE IF NOT EXISTS analytics_youtube_daily (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  video_id TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  estimated_minutes_watched REAL NOT NULL DEFAULT 0,
  average_view_duration_seconds REAL DEFAULT 0,
  average_view_percentage REAL DEFAULT 0,
  likes INTEGER DEFAULT 0,
  dislikes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  subscribers_gained INTEGER DEFAULT 0,
  subscribers_lost INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  impressions_ctr REAL DEFAULT 0,
  annotation_clicks INTEGER DEFAULT 0,
  card_clicks INTEGER DEFAULT 0,
  end_screen_clicks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, video_id)
);

CREATE INDEX IF NOT EXISTS idx_yt_daily_date ON analytics_youtube_daily(date);
CREATE INDEX IF NOT EXISTS idx_yt_daily_video ON analytics_youtube_daily(video_id);

-- チャンネル全体の日次KPI
CREATE TABLE IF NOT EXISTS analytics_youtube_channel_daily (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  total_views INTEGER NOT NULL DEFAULT 0,
  estimated_minutes_watched REAL NOT NULL DEFAULT 0,
  subscribers_gained INTEGER DEFAULT 0,
  subscribers_lost INTEGER DEFAULT 0,
  total_subscribers INTEGER DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yt_channel_daily_date ON analytics_youtube_channel_daily(date);
