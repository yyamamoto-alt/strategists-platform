-- 競合分析機能用テーブル

-- 監視対象サイト
CREATE TABLE IF NOT EXISTS competitor_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  check_frequency TEXT NOT NULL DEFAULT 'daily', -- daily, weekly
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ページスナップショット
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES competitor_sites(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  content_text TEXT, -- マークダウン化したテキスト（差分比較用）
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_site_id ON competitor_snapshots(site_id);
CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_fetched_at ON competitor_snapshots(fetched_at DESC);

-- 変更アラート
CREATE TABLE IF NOT EXISTS competitor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES competitor_sites(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES competitor_snapshots(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL DEFAULT 'content_change', -- content_change, new_page, price_change, etc.
  change_summary TEXT NOT NULL,
  details JSONB, -- 詳細な変更内容（差分テキスト等）
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_alerts_site_id ON competitor_alerts(site_id);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_created_at ON competitor_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_is_read ON competitor_alerts(is_read) WHERE is_read = false;
