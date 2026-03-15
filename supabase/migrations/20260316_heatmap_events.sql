-- ヒートマップイベント収集テーブル
CREATE TABLE IF NOT EXISTS heatmap_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    text NOT NULL,
  page_path     text NOT NULL,
  event_type    text NOT NULL CHECK (event_type IN ('click', 'scroll')),
  x_pct         real,
  y_pct         real,
  scroll_depth  real,
  viewport_w    integer,
  viewport_h    integer,
  page_h        integer,
  device_type   text NOT NULL CHECK (device_type IN ('pc', 'sp')),
  lp_version    text DEFAULT 'unknown',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_heatmap_page_date ON heatmap_events (page_path, created_at DESC);
CREATE INDEX idx_heatmap_type_device ON heatmap_events (event_type, device_type, page_path);
