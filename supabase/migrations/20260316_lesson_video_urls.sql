-- 動画講座の複数動画URL対応
-- video_urls: [{title, url, duration_minutes?, description?}, ...]
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS video_urls JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN lessons.video_urls IS 'Array of video objects for multi-video lessons';
