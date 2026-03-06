CREATE TABLE IF NOT EXISTS analytics_page_hourly (
  id bigint generated always as identity primary key,
  date date NOT NULL,
  hour smallint NOT NULL CHECK (hour >= 0 AND hour <= 23),
  segment text NOT NULL DEFAULT 'other',
  pageviews integer NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0,
  users integer NOT NULL DEFAULT 0,
  UNIQUE(date, hour, segment)
);
