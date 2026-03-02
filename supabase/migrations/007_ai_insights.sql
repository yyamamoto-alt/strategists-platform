-- =====================================================
-- Migration 007: AI経営示唆テーブル
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('marketing', 'management', 'sales')),
  content TEXT NOT NULL,
  data_snapshot JSONB,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス: カテゴリ別の最新取得用
CREATE INDEX IF NOT EXISTS idx_ai_insights_category_generated
  ON ai_insights (category, generated_at DESC);

-- RLS（CRM は service_role key で接続するため基本不要だが安全のため設定）
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- service_role は全操作可能（RLS バイパス）
-- anon ユーザーは読み取りのみ
CREATE POLICY "ai_insights_read_all" ON ai_insights
  FOR SELECT USING (true);
