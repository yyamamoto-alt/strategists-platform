-- 012: リッチコンテンツ対応
-- lessons テーブルに content_format カラムを追加
-- 'markdown' = 既存マークダウン, 'html' = Tiptap リッチエディタ出力

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS content_format TEXT DEFAULT 'markdown';

COMMENT ON COLUMN lessons.content_format IS 'Content format: markdown or html';
